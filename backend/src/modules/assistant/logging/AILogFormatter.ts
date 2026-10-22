import { AILogger } from "./AILogger";

export class AILogFormatter {
  /**
   * Formats the collected trace state of AILogger into a human-readable text log.
   */
  static format(logger: AILogger): string {
    const elapsedOverall = Date.now() - logger.startTime.getTime();
    
    // Find provider events
    const promptEvent = logger.events.find(e => e.layer === "Provider" && e.event === "Prompt Generated");
    const rawResponseEvent = logger.events.find(e => e.layer === "Provider" && e.event === "Raw LLM Response Received");
    const parsedJsonEvent = logger.events.find(e => e.layer === "Provider" && e.event === "LLMIntentResponse");
    const normalizedPlanEvent = logger.events.find(e => e.layer === "Provider" && e.event === "Normalized IntentPlan");

    // Find profiler metrics event
    const profilerEvent = logger.events.find(e => e.layer === "RuntimeProfiler" && e.event === "Profiler Metrics Captured");
    const metrics = profilerEvent ? profilerEvent.payload : {};

    // Extract provider timing
    const providerTimings = logger.events
      .filter(e => e.layer === "Provider" && e.elapsedMs !== undefined)
      .map(e => e.elapsedMs as number);
    const providerTotalDuration = providerTimings.reduce((sum, val) => sum + val, 0);

    // Find final response event
    const finalResponseEvent = logger.events.find(e => e.layer === "FinalResponse");
    const finalRes = finalResponseEvent ? finalResponseEvent.payload : logger.finalResponse;

    let out = "";
    out += `====================================================\n`;
    out += `RONINARC AI TRACE\n`;
    out += `====================================================\n`;
    out += `Request ID:       ${logger.requestId}\n`;
    out += `Session ID:       ${logger.sessionId || "unknown"}\n`;
    out += `User ID:          ${logger.userId}\n`;
    out += `Timestamp:        ${logger.startTime.toISOString()}\n`;
    out += `Original Request: ${logger.originalRequest}\n`;
    out += `Runtime Duration: ${metrics.overallRuntimeMs ?? elapsedOverall} ms\n`;
    out += `Status:           ${logger.status}\n`;
    out += `====================================================\n\n`;

    // 1. Conversation Runtime
    out += `----------------------------------------------------\n`;
    out += `Conversation Runtime\n`;
    out += `----------------------------------------------------\n`;
    const convoEvents = logger.events.filter(e => e.layer === "ConversationRuntime" || e.layer === "ConversationManager");
    if (convoEvents.length > 0) {
      convoEvents.forEach(e => {
        const time = e.timestamp.toISOString();
        if (e.event === "Reference Added") {
          out += `[${time}] Reference Added: ${e.payload.slot} -> ${e.payload.reference?.displayName || "unknown"} (ID: ${e.payload.reference?.entityId || "unknown"})\n`;
        } else if (e.event === "Reference Resolved") {
          out += `[${time}] Pronoun Reference Resolved: "${e.payload.original}" -> "${e.payload.resolved}" (Type: ${e.payload.type})\n`;
        } else {
          out += `[${time}] Event: ${e.event} - ${JSON.stringify(e.payload)}\n`;
        }
      });
    } else {
      out += `No conversation events recorded.\n`;
    }
    out += `\n`;

    // 2. Memory Runtime
    out += `----------------------------------------------------\n`;
    out += `Memory Runtime\n`;
    out += `----------------------------------------------------\n`;
    const memoryEvents = logger.events.filter(e => e.layer === "MemoryRuntime");
    
    // Loaded aliases & preferences
    const memoryLoadedEvent = memoryEvents.find(e => e.event === "Memory Loaded");
    const memoryUsedEvent = memoryEvents.find(e => e.event === "Memory Used");
    
    if (memoryLoadedEvent) {
      out += `Loaded Aliases Count:     ${memoryLoadedEvent.payload.aliasCount ?? 0}\n`;
      out += `Loaded Preferences Count: ${memoryLoadedEvent.payload.preferenceCount ?? 0}\n`;
    }
    
    if (memoryUsedEvent && memoryUsedEvent.payload.context) {
      const context = memoryUsedEvent.payload.context;
      out += `Loaded Aliases: ${JSON.stringify(context.aliases || {})}\n`;
      out += `Loaded Preferences: ${JSON.stringify(context.preferences || {})}\n`;
    }

    // Hits / Misses detection from Entity Resolver Resolution Traces
    const resolutionTraces = logger.events.filter(e => e.layer === "EntityResolver" && e.event === "Resolution Trace");
    const memoryHits: string[] = [];
    const memoryMisses: string[] = [];
    resolutionTraces.forEach(t => {
      const p = t.payload;
      if (p.chosenStrategy === "Alias Resolution Hierarchy") {
        memoryHits.push(`Hit: query "${p.originalQuery}" matched alias, resolving to "${p.finalResolutionStatus}"`);
      } else {
        memoryMisses.push(`Miss: query "${p.originalQuery}" did not match learned or static aliases`);
      }
    });

    if (memoryHits.length > 0) {
      out += `Memory Hits:\n` + memoryHits.map(h => `  - ${h}`).join("\n") + `\n`;
    } else {
      out += `Memory Hits: None\n`;
    }

    if (memoryMisses.length > 0) {
      out += `Memory Misses:\n` + memoryMisses.map(m => `  - ${m}`).join("\n") + `\n`;
    } else {
      out += `Memory Misses: None\n`;
    }

    // Learning events
    const learningEvents = memoryEvents.filter(e => e.event !== "Memory Loaded" && e.event !== "Memory Used");
    if (learningEvents.length > 0) {
      out += `Learning Events:\n`;
      learningEvents.forEach(e => {
        out += `  - [${e.timestamp.toISOString()}] ${e.event}: ${JSON.stringify(e.payload)}\n`;
      });
    } else {
      out += `Learning Events: None\n`;
    }
    out += `\n`;

    // 3. Provider
    out += `----------------------------------------------------\n`;
    out += `Provider\n`;
    out += `----------------------------------------------------\n`;
    if (promptEvent) {
      out += `Model: ${promptEvent.payload.model || "gemma3:4b"}\n`;
      out += `Prompt Length: ${promptEvent.payload.promptLength || 0} characters\n`;
      out += `Generated Prompt:\n`;
      out += `"""\n${promptEvent.payload.fullPrompt || "(Full prompt not logged)"}\n"""\n\n`;
    } else {
      out += `Model: unknown\n`;
      out += `Prompt: not generated\n`;
    }

    if (rawResponseEvent) {
      out += `Raw LLM Response:\n`;
      out += `"""\n${rawResponseEvent.payload.fullResponse || "(Full response not logged)"}\n"""\n\n`;
    } else {
      out += `Raw LLM Response: none received\n`;
    }

    if (parsedJsonEvent) {
      out += `Parsed JSON:\n`;
      out += `${JSON.stringify(parsedJsonEvent.payload, null, 2)}\n\n`;
    }

    if (normalizedPlanEvent) {
      out += `Validation Result: SUCCESS\n`;
    } else {
      out += `Validation Result: ${logger.errors.length > 0 ? "FAILED" : "N/A"}\n`;
    }
    out += `\n`;

    // 4. Planning Runtime
    out += `----------------------------------------------------\n`;
    out += `Planning Runtime\n`;
    out += `----------------------------------------------------\n`;
    const planningEvents = logger.events.filter(e => e.layer === "PlanningRuntime" || e.layer === "PlanningEngine");
    if (planningEvents.length > 0) {
      const startEvent = planningEvents.find(e => e.event === "Planning Started");
      const capEvent = planningEvents.find(e => e.event === "Capability Resolution");
      const compEvent = planningEvents.find(e => e.event === "Planning Completed" || e.event === "Planning Completed (Clarification Required)");

      if (startEvent) {
        out += `Planning Status: Started (IntentPlan ID: ${startEvent.payload.intentPlanId})\n`;
      }
      if (capEvent) {
        out += `Capabilities: ${JSON.stringify(capEvent.payload.capabilities || [])}\n`;
      }
      if (compEvent) {
        out += `Planning Result Status: ${compEvent.payload.status || "SUCCESS"}\n`;
        if (compEvent.payload.missingFacts) {
          out += `Missing Facts: ${JSON.stringify(compEvent.payload.missingFacts)}\n`;
        }
        if (compEvent.payload.explanation) {
          out += `Planning Explanation: ${compEvent.payload.explanation}\n`;
        }
      }
    } else {
      out += `No planning events recorded.\n`;
    }
    out += `\n`;

    // 5. Entity Resolution
    out += `----------------------------------------------------\n`;
    out += `Entity Resolution\n`;
    out += `----------------------------------------------------\n`;
    if (resolutionTraces.length > 0) {
      resolutionTraces.forEach(t => {
        const p = t.payload;
        out += `Original Query:    "${p.originalQuery}"\n`;
        out += `Normalized Query:  "${p.normalizedQuery}"\n`;
        out += `Alias Match:       ${p.learningMemoryResult || "NONE"}\n`;
        out += `Exact Match:       ${p.exactMatchResult || "NONE"}\n`;
        out += `Fuzzy Match:       ${JSON.stringify(p.fuzzyCandidates || [])}\n`;
        out += `Chosen Strategy:   ${p.chosenStrategy || "NONE"}\n`;
        out += `Confidence Score:  ${p.finalConfidence ?? 0}\n`;
        out += `Chosen Entity:     ${p.finalResolutionStatus || "NOT_FOUND"}\n`;
        out += `---\n`;
      });
    } else {
      out += `No entity resolution traces recorded.\n`;
    }
    out += `\n`;

    // 6. Clarification
    out += `----------------------------------------------------\n`;
    out += `Clarification\n`;
    out += `----------------------------------------------------\n`;
    const clarificationEvents = logger.events.filter(e => e.layer === "ClarificationRuntime");
    if (clarificationEvents.length > 0) {
      const started = clarificationEvents.some(e => e.event === "Clarification Started");
      const built = clarificationEvents.find(e => e.event === "Clarification Built");
      const resolved = clarificationEvents.find(e => e.event === "Resolved Choice");
      const cont = clarificationEvents.find(e => e.event === "Execution Continued");
      const failed = clarificationEvents.find(e => e.event === "Clarification Failed");
      const attemptFailed = clarificationEvents.find(e => e.event === "Clarification Attempt Failed");

      out += `Clarification Requested: ${started ? "YES" : "NO"}\n`;
      if (built) {
        out += `Question/Reason: ${built.payload.reason}\n`;
        out += `Candidates:      ${JSON.stringify(built.payload.candidates || [])}\n`;
      }
      if (resolved) {
        out += `User Choice:     ${resolved.payload.choiceLabel} (ID: ${resolved.payload.choiceId})\n`;
      }
      if (cont) {
        out += `Resume:          SUCCESS (Continued requestId: ${cont.payload.newRequestId})\n`;
      }
      if (attemptFailed) {
        out += `Retry:           REQUIRED (Retry Count: ${attemptFailed.payload.retryCount}, User input: "${attemptFailed.payload.userMessage}")\n`;
      }
      if (failed) {
        out += `Cancellation:    ${failed.payload.reason}\n`;
      }
    } else {
      out += `No clarification actions recorded.\n`;
    }
    out += `\n`;

    // 7. Execution
    out += `----------------------------------------------------\n`;
    out += `Execution\n`;
    out += `----------------------------------------------------\n`;
    const toolCompletedEvents = logger.events.filter(e => e.layer === "ExecutionPipeline" && (e.event === "Tool Completed" || e.event === "Tool Failed"));
    if (toolCompletedEvents.length > 0) {
      toolCompletedEvents.forEach(e => {
        const p = e.payload;
        out += `Tool:               ${p.tool || "unknown"}\n`;
        out += `Status:             ${p.status || "unknown"}\n`;
        out += `Input Parameters:   ${JSON.stringify(p.input || {})}\n`;
        out += `Resolved Params:    ${JSON.stringify(p.input || {})}\n`;
        out += `Output:             ${JSON.stringify(p.output || {})}\n`;
        out += `Execution Time:     ${p.duration ?? 0} ms\n`;
        if (p.error) {
          out += `Errors:             ${p.error}\n`;
        }
        out += `---\n`;
      });
    } else {
      out += `No tool execution steps recorded.\n`;
    }
    out += `\n`;

    // 8. Errors
    out += `----------------------------------------------------\n`;
    out += `Errors\n`;
    out += `----------------------------------------------------\n`;
    if (logger.errors.length > 0) {
      logger.errors.forEach(err => {
        out += `Layer:             ${err.layer}\n`;
        out += `Runtime:           ${err.layer}\n`;
        out += `Message:           ${err.message}\n`;
        out += `Request ID:        ${logger.requestId}\n`;
        out += `Associated Prompt:\n`;
        out += `"""\n${promptEvent?.payload.fullPrompt || "N/A"}\n"""\n`;
        out += `Raw LLM Response:\n`;
        out += `"""\n${rawResponseEvent?.payload.fullResponse || "N/A"}\n"""\n`;
        out += `Validation Result: ${normalizedPlanEvent ? "SUCCESS" : "FAILED"}\n`;
        out += `Stack Trace:\n`;
        out += `${err.stack || "No stack trace available."}\n`;
        out += `---\n`;
      });
    } else {
      out += `No errors recorded.\n`;
    }
    out += `\n`;

    // 9. Final Response
    out += `----------------------------------------------------\n`;
    out += `Final Response\n`;
    out += `----------------------------------------------------\n`;
    if (finalRes) {
      out += `HTTP Status:        ${finalRes.success ? "200 (Success)" : "400/500 (Error)"}\n`;
      out += `API Response JSON:\n`;
      out += `${JSON.stringify(finalRes, null, 2)}\n\n`;
      out += `Assistant Response: ${finalRes.message || "N/A"}\n`;
      out += `Summary:            ${finalRes.summary || "N/A"}\n`;
    } else {
      out += `No final response recorded.\n`;
    }
    out += `\n`;

    // 10. Timings
    out += `----------------------------------------------------\n`;
    out += `Timings\n`;
    out += `----------------------------------------------------\n`;
    out += `Conversation Runtime:     ${metrics.conversationDurationMs ?? "N/A"} ms\n`;
    out += `Memory Runtime:           ${metrics.memoryDurationMs ?? "N/A"} ms\n`;
    out += `Provider (LLM Calls):     ${providerTotalDuration || "N/A"} ms\n`;
    out += `Planning Runtime:         ${metrics.planningDurationMs ?? "N/A"} ms\n`;
    out += `Clarification Runtime:    ${metrics.clarificationDurationMs ?? "N/A"} ms\n`;
    out += `Execution Runtime:        ${metrics.executionDurationMs ?? "N/A"} ms\n`;
    out += `Overall Runtime:          ${metrics.overallRuntimeMs ?? elapsedOverall} ms\n`;
    out += `====================================================\n`;

    return out;
  }
}
