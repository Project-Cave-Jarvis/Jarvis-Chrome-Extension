export default [
  {
    name: "get_time_and_resources",
    description: "Current local time plus CPU core count and memory (no device model or identifiers).",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const [cpu, mem] = await Promise.all([chrome.system.cpu.getInfo(), chrome.system.memory.getInfo()]);
      return { time: new Date().toString(), cores: cpu.numOfProcessors, memoryTotalGB: +(mem.capacity / 1e9).toFixed(1), memoryFreeGB: +(mem.availableCapacity / 1e9).toFixed(1) };
    },
  },
];
