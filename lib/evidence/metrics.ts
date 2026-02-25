export type RankingMetrics = {
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
};

function dcg(relevances: number[]): number {
  return relevances.reduce((sum, rel, index) => {
    const rank = index + 1;
    return sum + (rel / Math.log2(rank + 1));
  }, 0);
}

export function computeRankingMetrics(
  retrievedIds: string[],
  expectedIds: Set<string>,
  k: number
): RankingMetrics {
  if (expectedIds.size === 0 || k <= 0) {
    return { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0 };
  }

  const topK = retrievedIds.slice(0, k);
  const relevances: number[] = topK.map(id => (expectedIds.has(id) ? 1 : 0));
  const hits = relevances.reduce<number>((sum, rel) => sum + rel, 0);

  const precisionAtK = hits / k;
  const recallAtK = hits / expectedIds.size;

  const idealRelevances = Array.from({ length: Math.min(expectedIds.size, k) }, () => 1)
    .concat(Array.from({ length: Math.max(0, k - expectedIds.size) }, () => 0));

  const ndcgAtK = dcg(relevances) / Math.max(dcg(idealRelevances), 1e-9);

  return { precisionAtK, recallAtK, ndcgAtK };
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
