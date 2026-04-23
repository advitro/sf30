/**
 * @jest-environment jsdom
 */
describe("SG_CIRCUIT_BREAKER", () => {
  beforeAll(() => {
    require("../../src/shared/circuit-breaker.js");
  });

  it("exposes createCircuitBreaker", () => {
    expect(typeof self.SG_CIRCUIT_BREAKER.createCircuitBreaker).toBe("function");
  });

  it("starts closed", () => {
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(3, 300000);
    expect(cb.isOpen()).toBe(false);
    expect(cb.getState().failures).toBe(0);
  });

  it("opens after threshold failures", () => {
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(3, 300000);
    cb.record(false);
    cb.record(false);
    expect(cb.isOpen()).toBe(false);
    cb.record(false);
    expect(cb.isOpen()).toBe(true);
  });

  it("resets on success", () => {
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(3, 300000);
    cb.record(false);
    cb.record(false);
    cb.record(true);
    expect(cb.getState().failures).toBe(0);
    expect(cb.isOpen()).toBe(false);
  });

  it("transitions to half-open after cooldown", () => {
    jest.useFakeTimers();
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(2, 5000);
    cb.record(false);
    cb.record(false);
    expect(cb.isOpen()).toBe(true);

    jest.advanceTimersByTime(6000);
    expect(cb.isOpen()).toBe(false);
    jest.useRealTimers();
  });

  it("calls onReset when transitioning to half-open", () => {
    jest.useFakeTimers();
    const onReset = jest.fn();
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(2, 5000, onReset);
    cb.record(false);
    cb.record(false);
    expect(cb.isOpen()).toBe(true);

    jest.advanceTimersByTime(6000);
    cb.isOpen();
    expect(onReset).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("setState restores internal state", () => {
    const cb = self.SG_CIRCUIT_BREAKER.createCircuitBreaker(3, 300000);
    cb.setState({ failures: 2, open: true, lastFailure: Date.now() });
    expect(cb.getState().failures).toBe(2);
    expect(cb.getState().open).toBe(true);
  });
});
