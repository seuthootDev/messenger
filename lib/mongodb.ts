import { Db, MongoClient } from "mongodb";

const dbName = process.env.MONGODB_DB || "bilingual_chat";

// TTL: 3일 = 259200초
const TTL_SECONDS = 3 * 24 * 60 * 60;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesEnsured: boolean | undefined;
}

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define MONGODB_URI in .env.local");
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }

  const mongoClient = await global._mongoClientPromise;
  return mongoClient.db(dbName);
}

export async function ensureIndexes(db: Db): Promise<void> {
  if (global._mongoIndexesEnsured) return;

  await db.collection("messages").createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: TTL_SECONDS, background: true, name: "ttl_3days" },
  );

  // sender 기반 조회 성능용 인덱스
  await db.collection("messages").createIndex(
    { sender: 1, createdAt: 1 },
    { background: true, name: "sender_createdAt" },
  );

  global._mongoIndexesEnsured = true;
}
