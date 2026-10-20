interface QueryDataState<T> { data: T | null | undefined; isError: boolean; isLoading: boolean }

/** React Query can pause a fresh offline request without ever reaching an error. */
export function selectOfflineData<T>(query: QueryDataState<T>, offline: boolean, loadSnapshot: () => T | null | undefined, options: { rejectOnlineError?: boolean } = {}) {
  const data = options.rejectOnlineError && query.isError && !offline ? null
    : query.data !== undefined ? query.data : offline ? loadSnapshot() : null;
  const hasData = data !== null && data !== undefined;
  return {
    data: data ?? null,
    isLoading: query.isLoading && !hasData,
    isError: offline ? !hasData : query.isError,
    isOffline: offline && hasData,
  };
}
