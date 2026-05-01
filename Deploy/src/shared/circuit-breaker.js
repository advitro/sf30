// Circuit breaker — pure logic, no external dependencies.
// Used by the service worker to avoid hammering the license server.

(function (global) {
  "use strict";

  if (global.SG_CIRCUIT_BREAKER) {return;}

  /**
   * Creates a new circuit breaker instance.
   * @param {number} threshold — failures before opening
   * @param {number} cooldownMs — ms to wait before half-open
   * @param {Function} [onReset] — called when breaker transitions open → half-open
   */
  function createCircuitBreaker(threshold, cooldownMs, onReset) {
    var failures = 0;
    var open = false;
    var lastFailure = 0;

    function isOpen() {
      if (!open) {return false;}
      if (Date.now() - lastFailure > cooldownMs) {
        open = false;
        failures = 0;
        if (typeof onReset === "function") {onReset();}
        return false;
      }
      return true;
    }

    function record(success) {
      if (success) {
        failures = 0;
        open = false;
      } else {
        failures++;
        lastFailure = Date.now();
        if (failures >= threshold) {
          open = true;
        }
      }
    }

    function getState() {
      return { failures: failures, open: open, lastFailure: lastFailure };
    }

    function setState(state) {
      failures = state.failures || 0;
      open = state.open || false;
      lastFailure = state.lastFailure || 0;
    }

    return {
      isOpen: isOpen,
      record: record,
      getState: getState,
      setState: setState
    };
  }

  global.SG_CIRCUIT_BREAKER = {
    createCircuitBreaker: createCircuitBreaker
  };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
