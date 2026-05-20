import { useEffect, useRef } from 'react';
import { usePublicClient, useWatchBlockNumber } from 'wagmi';
import { CHAIN_POLLING_INTERVAL } from '@/lib/chain';

export function usePublicContractEvent({
  address,
  abi,
  eventName,
  enabled = true,
  onLogs,
}) {
  const publicClient = usePublicClient();
  const onLogsRef = useRef(onLogs);
  const seenLogsRef = useRef(new Set());
  const lastBlockRef = useRef(null);

  useEffect(() => {
    onLogsRef.current = onLogs;
  }, [onLogs]);

  useWatchBlockNumber({
    enabled: enabled && Boolean(address) && Boolean(publicClient),
    poll: true,
    pollingInterval: CHAIN_POLLING_INTERVAL,
    onBlockNumber: async (blockNumber) => {
      const fromBlock = lastBlockRef.current === null
        ? blockNumber
        : lastBlockRef.current + 1n;
      lastBlockRef.current = blockNumber;
      if (fromBlock > blockNumber) return;

      const logs = await publicClient.getContractEvents({
        address,
        abi,
        eventName,
        fromBlock,
        toBlock: blockNumber,
      });

      const freshLogs = logs.filter((log) => {
        const logId = `${log.transactionHash}:${log.logIndex}`;
        if (seenLogsRef.current.has(logId)) return false;
        seenLogsRef.current.add(logId);
        if (seenLogsRef.current.size > 500) {
          const [oldestLogId] = seenLogsRef.current;
          seenLogsRef.current.delete(oldestLogId);
        }
        return true;
      });

      if (freshLogs.length > 0) {
        onLogsRef.current?.(freshLogs);
      }
    },
    onError: (error) => {
      console.debug(`[chain debug] ${eventName} watcher failed`, error);
    },
  });
}
