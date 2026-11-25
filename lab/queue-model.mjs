/**
 * Stationary FCFS M/M/c and M/M/c/K. Rates are requests per second.
 * Capacity counts all admitted jobs, including jobs in service.
 */
export function evaluateQueue({ arrival, service, servers, capacity = null, threshold }) {
  if (!Number.isFinite(arrival) || arrival < 0 || arrival > 1e6 ||
      !Number.isFinite(service) || service < 1e-6 || service > 1e6 ||
      !Number.isInteger(servers) || servers < 1 || servers > 100 ||
      !Number.isFinite(threshold) || threshold < 0 || threshold > 86400 ||
      (capacity !== null && (!Number.isInteger(capacity) || capacity < servers || capacity > 5000))) {
    throw new RangeError('نرخ‌ها، تعداد خدمت‌دهنده، ظرفیت و آستانه را در بازهٔ مجاز وارد کنید.');
  }

  const serviceCapacity = servers * service;
  const offeredUtilization = arrival / serviceCapacity;
  if (capacity === null && arrival >= serviceCapacity) {
    return { status: 'unstable', offeredUtilization };
  }

  const last = capacity ?? servers;
  const logWeights = [0];
  const logRatio = Math.log(arrival) - Math.log(service);
  for (let n = 1; n <= last; n++) {
    logWeights.push(logWeights[n - 1] + logRatio - Math.log(Math.min(servers, n)));
  }
  const spare = serviceCapacity - arrival;
  if (capacity === null) logWeights[servers] -= Math.log(spare / serviceCapacity);
  const peak = Math.max(...logWeights);
  const weights = logWeights.map(logWeight => Math.exp(logWeight - peak));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const occupancy = weights.map(weight => weight / total);

  let blocking = 0, admissionShare = 1, throughput = arrival, waiting, exceedance, queueLength, waitingSeconds;
  if (capacity === null) {
    waiting = occupancy[servers];
    exceedance = waiting * Math.exp(-spare * threshold);
    waitingSeconds = waiting / spare;
    queueLength = arrival * waitingSeconds;
  } else {
    blocking = occupancy[capacity];
    // Sum admission weights directly, so near-certain blocking doesn't suffer cancellation.
    const admittedWeights = weights.slice(0, capacity);
    const admitted = admittedWeights.reduce((sum, weight) => sum + weight, 0);
    admissionShare = admitted / total;
    throughput = arrival * admissionShare;
    const mean = serviceCapacity * threshold;
    const logMean = Math.log(mean);
    let poissonLog = -mean, erlangTail = 0;
    waiting = 0;
    exceedance = 0;
    waitingSeconds = 0;
    for (let n = servers; n < capacity; n++) {
      const steps = n - servers + 1;
      const probability = admittedWeights[n] / admitted;
      if (mean === 0) erlangTail = 1;
      else {
        erlangTail += Math.exp(poissonLog);
        poissonLog += logMean - Math.log(steps);
      }
      waiting += probability;
      exceedance += probability * Math.min(1, erlangTail);
      waitingSeconds += probability * steps / serviceCapacity;
    }
    queueLength = throughput * waitingSeconds;
  }

  return {
    status: 'steady', offeredUtilization,
    utilization: throughput / serviceCapacity, idle: occupancy[0],
    blocking, throughput, waiting, waitingSeconds, exceedance,
    onTimeArrivalShare: admissionShare * (1 - exceedance),
    responseSeconds: waitingSeconds + 1 / service,
    queueLength, systemLength: queueLength + throughput / service,
  };
}

/** Smallest homogeneous server count meeting a target for all offered requests. */
export function minimumServers(input, target) {
  if (!Number.isFinite(target) || target <= 0 || target > 1) {
    throw new RangeError('هدف شروع به‌موقع باید بیشتر از صفر و حداکثر ۱۰۰٪ باشد.');
  }
  const maxServers = Math.min(100, input.capacity ?? 100);
  for (let servers = 1; servers <= maxServers; servers++) {
    const result = evaluateQueue({ ...input, servers });
    if (result.status === 'steady' && result.onTimeArrivalShare >= target) {
      return { servers, result };
    }
  }
  return null;
}
