// Per-user watchlist persistence. One document per user with an items array,
// matching how the rest of the app keeps user-owned state (userId as String).
// Injected model keeps this unit-testable without a live Mongo connection.
export function createWatchlistStore({ model, maxItems = 100 }) {
  async function list(userId) {
    const doc = await model.findOne({ userId });
    if (!doc || !Array.isArray(doc.items)) return [];
    return doc.items.map((item) => (item.toObject ? item.toObject() : item));
  }

  async function add(userId, item) {
    const existing = await model.findOne({ userId, 'items.mint': item.mint });
    if (existing) {
      const stored = existing.items.find((i) => i.mint === item.mint);
      return { added: false, item: stored && stored.toObject ? stored.toObject() : stored };
    }
    const current = await model.findOne({ userId });
    if (current && current.items.length >= maxItems) {
      return { error: `Watchlist limit reached (${maxItems})`, status: 400 };
    }
    const updated = await model.findOneAndUpdate(
      { userId },
      { $push: { items: item }, $setOnInsert: { userId } },
      { upsert: true, new: true },
    );
    const stored = updated.items.find((i) => i.mint === item.mint);
    return { added: true, item: stored && stored.toObject ? stored.toObject() : stored };
  }

  async function remove(userId, mint) {
    const updated = await model.findOneAndUpdate(
      { userId, 'items.mint': mint },
      { $pull: { items: { mint } } },
      { new: true },
    );
    return { removed: Boolean(updated) };
  }

  return { list, add, remove, maxItems };
}
