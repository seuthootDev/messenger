import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ensureIndexes, getMongoDb } from "@/lib/mongodb";
import { getAuthCookieFromHeader, getAuthSessionFromCookie } from "@/lib/auth";

type Sender = "A" | "B";

type MessageDocument = {
  _id: ObjectId;
  sender: Sender;
  text: string;
  translatedText: string;
  createdAt: Date;
};

type DeepLTranslationResponse = {
  translations?: Array<{
    text: string;
  }>;
};

function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

function getSession(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieValue = getAuthCookieFromHeader(cookieHeader);
  return getAuthSessionFromCookie(cookieValue);
}

async function translateText(text: string, sender: Sender) {
  const apiKey = process.env.DEEPL_API_KEY;
  const apiUrl = process.env.DEEPL_API_URL || "https://api-free.deepl.com";

  if (!apiKey) {
    return sender === "A"
      ? "[RU] Перевод недоступен: добавьте DEEPL_API_KEY"
      : "[KO] 번역을 사용할 수 없습니다: DEEPL_API_KEY를 추가하세요";
  }

  const params = new URLSearchParams({
    text,
    target_lang: sender === "A" ? "RU" : "KO",
    preserve_formatting: "1",
  });

  const response = await fetch(`${apiUrl}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepL request failed: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as DeepLTranslationResponse;
  const translatedText = data.translations?.[0]?.text;

  if (!translatedText) {
    throw new Error("DeepL response did not include translated text");
  }

  return translatedText;
}

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session.authenticated) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ messages: [] });
  }

  try {
    const db = await getMongoDb();
    await ensureIndexes(db);

    // TTL이 3일이므로 DB에 남아있는 데이터가 곧 3일치 전체
    const docs = (await db
      .collection<MessageDocument>("messages")
      .find({})
      .sort({ createdAt: 1 })
      .toArray()) as MessageDocument[];

    const messages = docs.map((doc) => ({
      id: doc._id.toString(),
      sender: doc.sender,
      text: doc.text,
      translatedText: doc.translatedText,
      createdAt: doc.createdAt,
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: "Не удалось загрузить сообщения", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session.authenticated) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { sender?: Sender; text?: string };
    const sender = body.sender;
    const text = body.text?.trim();

    if (!sender || (sender !== "A" && sender !== "B")) {
      return NextResponse.json({ error: "Некорректный отправитель" }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: "Текст сообщения обязателен" }, { status: 400 });
    }

    if (session.user !== sender) {
      return NextResponse.json({ error: "Нельзя отправлять от другого пользователя" }, { status: 403 });
    }

    const translatedText = await translateText(text, sender);

    const message = {
      sender,
      text,
      translatedText,
      createdAt: new Date(),
    };

    if (!isMongoConfigured()) {
      return NextResponse.json({
        message: {
          id: `local-${Date.now()}`,
          ...message,
        },
      });
    }

    const db = await getMongoDb();
    await ensureIndexes(db);
    const result = await db.collection("messages").insertOne(message);

    return NextResponse.json({
      message: {
        id: result.insertedId.toString(),
        ...message,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Не удалось отправить сообщение", details: String(error) },
      { status: 500 },
    );
  }
}
