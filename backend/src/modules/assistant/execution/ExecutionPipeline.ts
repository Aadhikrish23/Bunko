import { ExecutionContext } from "./ExecutionContext";
import { ExecutionResult } from "./ExecutionResult";
import { ExecutionStepResult } from "./ExecutionStepResult";
import { ExecutionConstants } from "./ExecutionConstants";
import { ToolValidator } from "./ToolValidator";
import toolParameterResolver from "./ToolParameterResolver";
import toolDependencyResolver from "./ToolDependencyResolver";
import executionSummaryBuilder from "./ExecutionSummaryBuilder";
import executionMetrics from "./ExecutionMetrics";
import executionHealth from "./ExecutionHealth";
import executionEventBus from "./ExecutionEventBus";
import executionHooks from "./ExecutionHooks";
import { AIToolRegistry } from "../sdk/AIToolRegistry";
import { AIExecutor } from "../sdk/AIExecutor";
import { AIToolContext } from "../sdk/AIToolContext";
import toolMapper from "./ToolMapper";
import aiTraceLogger from "../debug/AITraceLogger";
import { ExecutionRecoveryService } from "./ExecutionRecoveryService";
import { ExecutionAdapter } from "./ExecutionAdapter";
import { ExecutionRuntimeError } from "../runtime/errors/ExecutionRuntimeError";
import toolMetadataRegistry from "./ToolMetadataRegistry";

export class ExecutionPipeline {
  private readonly toolValidator: ToolValidator;
  private readonly adapter: ExecutionAdapter;
  private readonly recoveryService: ExecutionRecoveryService;

  constructor(
    private readonly registry: AIToolRegistry,
    private readonly executor: AIExecutor
  ) {
    this.toolValidator = new ToolValidator(this.registry);
    this.adapter = new ExecutionAdapter();
    this.recoveryService = new ExecutionRecoveryService();
  }

  /**
   * Orchestrates the validator checks, parameters/dependency resolutions, sequential executions, and finalizations.
   */
  async run(context: ExecutionContext, toolContext: AIToolContext, userQuery?: string): Promise<ExecutionResult> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    await executionEventBus.publish(ExecutionConstants.EVENT_STARTED, { executionId: context.executionId });
    await executionHooks.triggerBeforeExecution(context);

    const stepResults: ExecutionStepResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // --- STAGE 1: VALIDATE ---
    if (trace) {
      trace.log("ExecutionPipeline", "Validation", { planId: context.executionPlan.id });
    }

    for (const step of context.executionPlan.steps) {
      if (!step.toolName) {
        step.toolName = toolMapper.mapCapabilityToTool(
          step.input.capabilityId as string,
          step.input,
          userQuery
        );
      }
    }

    const resolvedPlan = await toolParameterResolver.resolve(context);

    const validationErrors = [...new Set(this.toolValidator.validate(resolvedPlan, context.resolvedIntentPlan))];
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);

      await executionEventBus.publish(ExecutionConstants.EVENT_FAILED, { executionId: context.executionId, errors });

      const failedResult: ExecutionResult = {
        executionId: context.executionId,
        status: ExecutionConstants.STATUS_FAILED,
        startedAt: new Date(startTime),
        finishedAt: new Date(),
        steps: [],
        // Each validation error is already a user-facing sentence.
        summary: validationErrors.join(" "),
        errors,
        warnings,
      };

      await executionHooks.triggerAfterExecution(context, failedResult);
      executionHealth.track(failedResult, Date.now() - startTime, false);

      if (trace) {
        trace.log("ExecutionPipeline", "Finalization", { status: "FAILED" });
      }

      return failedResult;
    }

    await executionEventBus.publish(ExecutionConstants.EVENT_VALIDATED, { executionId: context.executionId });

    // --- STAGE 2: PREPARE (Capability mapping / scheduling graphs) ---
    if (trace) {
      trace.log("ExecutionPipeline", "Preparation", { stepsCount: resolvedPlan.steps.length });
    }

    // --- STAGE 3: EXECUTE (Sequential execution scheduler) ---
    if (trace) {
      trace.log("ExecutionPipeline", "Execution", { scheduler: "SEQUENTIAL" });
    }

    let overallStatus = ExecutionConstants.STATUS_SUCCESS;
    let isCancelled = false;

    for (let i = 0; i < resolvedPlan.steps.length; i++) {
      let step = resolvedPlan.steps[i]!;

      step = toolDependencyResolver.resolve(step, stepResults);

      const capability = toolMetadataRegistry.get(step.toolName);
      const policy = capability?.executionPolicy || "SEQUENTIAL";

      // 1. EXCLUSIVE policy enforcement
      if (policy === "EXCLUSIVE" && resolvedPlan.steps.length > 1) {
        throw new ExecutionRuntimeError(
          `Execution Policy Violation: Capability "${step.toolName}" requires EXCLUSIVE execution but plan has multiple steps.`,
          "POLICY_VIOLATION"
        );
      }

      // 2. IDEMPOTENT policy: skip execution if identical tool step succeeded in the current run previously
      if (policy === "IDEMPOTENT") {
        const alreadyRun = stepResults.find(
          (r) => r.tool === step.toolName && r.status === "SUCCESS" && JSON.stringify(r.input) === JSON.stringify(step.input)
        );
        if (alreadyRun) {
          const skippedResult: ExecutionStepResult = {
            stepId: step.id,
            tool: step.toolName,
            status: ExecutionConstants.STATUS_SKIPPED,
            duration: 0,
            input: step.input,
            retryCount: 0,
            output: alreadyRun.output,
          };
          stepResults.push(skippedResult);
          continue;
        }
      }

      const stepStartTime = Date.now();

      await executionEventBus.publish(ExecutionConstants.EVENT_STEP_STARTED, { stepId: step.id });
      await executionHooks.triggerBeforeStep(context, step);

      if (trace) {
        trace.log("ExecutionPipeline", "Tool Started", { stepId: step.id, toolName: step.toolName });
      }

      if (isCancelled) {
        const skippedResult: ExecutionStepResult = {
          stepId: step.id,
          tool: step.toolName,
          status: ExecutionConstants.STATUS_SKIPPED,
          duration: 0,
          input: step.input,
          retryCount: 0,
        };
        stepResults.push(skippedResult);
        await executionEventBus.publish(ExecutionConstants.EVENT_STEP_FINISHED, skippedResult);
        await executionHooks.triggerAfterStep(context, step, skippedResult);
        if (trace) {
          trace.log("ExecutionPipeline", "Tool Completed", skippedResult);
        }
        continue;
      }

      let attempt = 0;
      let retryCount = 0;
      let success = false;
      let stepError: string | null = null;
      let stepOutput: Record<string, unknown> | null = null;

      while (!success) {
        try {
          const adaptedStep = await this.adapter.adapt(
            { id: resolvedPlan.id, steps: [step] },
            context.resolvedIntentPlan
          );

          const results = await this.executor.execute(adaptedStep, toolContext);
          const res = results[0];

          if (res && res.success) {
            success = true;
            stepOutput = res as unknown as Record<string, unknown>;
          } else {
            throw new Error(res?.error || "Step execution returned failure.");
          }
        } catch (err: unknown) {
          attempt += 1;
          const errorObj = err as Error;
          stepError = errorObj.message || String(err);

          const action = await this.recoveryService.attemptRecovery(step, err, attempt);

          if (action === "RETRY") {
            retryCount += 1;
            await executionEventBus.publish(ExecutionConstants.EVENT_STEP_RETRIED, { stepId: step.id, attempt, error: stepError });
            continue;
          }

          if (action === "CONTINUE") {
            success = true;
            warnings.push(`Non-critical step "${step.toolName}" failed: ${stepError}`);
            break;
          }

          overallStatus = ExecutionConstants.STATUS_FAILED;
          errors.push(`Critical step "${step.toolName}" failed: ${stepError}`);
          isCancelled = true;
          break;
        }
      }

      const stepDuration = Date.now() - stepStartTime;
      const stepStatus = success && !stepError ? ExecutionConstants.STATUS_SUCCESS : ExecutionConstants.STATUS_FAILED;

      const stepResult: ExecutionStepResult = {
        stepId: step.id,
        tool: step.toolName,
        status: stepStatus,
        duration: stepDuration,
        input: step.input,
        output: stepOutput,
        error: stepError,
        retryCount,
      };

      stepResults.push(stepResult);

      await executionEventBus.publish(ExecutionConstants.EVENT_STEP_FINISHED, stepResult);
      await executionHooks.triggerAfterStep(context, step, stepResult);

      if (trace) {
        if (stepStatus === ExecutionConstants.STATUS_FAILED) {
          trace.log("ExecutionPipeline", "Tool Failed", stepResult);
        } else {
          trace.log("ExecutionPipeline", "Tool Completed", stepResult);
        }
      }
    }

    // --- STAGE 4: FINALIZATION ---
    if (overallStatus === ExecutionConstants.STATUS_SUCCESS && stepResults.length > 0) {
      const hasFailures = stepResults.some((r) => r.status === ExecutionConstants.STATUS_FAILED);
      const allFailed = stepResults.every((r) => r.status === ExecutionConstants.STATUS_FAILED);
      if (allFailed) {
        overallStatus = ExecutionConstants.STATUS_FAILED;
      } else if (hasFailures) {
        overallStatus = ExecutionConstants.STATUS_PARTIAL_SUCCESS;
      }
    }

    const totalDuration = Date.now() - startTime;
    const finalResult: ExecutionResult = {
      executionId: context.executionId,
      status: overallStatus,
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      steps: stepResults,
      summary: "",
      errors,
      warnings,
    };

    const summary = executionSummaryBuilder.build(finalResult);
    const calculatedMetrics = executionMetrics.calculate(stepResults, totalDuration);

    finalResult.summary = summary;

    await executionEventBus.publish(ExecutionConstants.EVENT_FINISHED, finalResult);
    await executionHooks.triggerAfterExecution(context, finalResult);

    executionHealth.track(finalResult, totalDuration, false);

    if (trace) {
      trace.log("ExecutionPipeline", "Finalization", { status: overallStatus, metrics: calculatedMetrics });
    }

    return finalResult;
  }
}
