import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 주기적으로 API를 호출하여 데이터를 갱신하는 커스텀 훅
 */
export default function usePolling(fetchFn, interval = 3000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result.data ?? result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const id = setInterval(fetchData, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchData, interval]);

  return { data, loading, error, refetch: fetchData };
}
