import { db } from "@/db";
import { contactSubmissions } from "@/db/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, company, service, message } = body;

    if (!name || !email || !message) {
      return Response.json(
        { error: "Name, email, and message are required." },
        { status: 400 }
      );
    }

    await db.insert(contactSubmissions).values({
      name,
      email,
      phone: phone || null,
      company: company || null,
      service: service || null,
      message,
    });

    return Response.json({ success: true, message: "Thank you! We'll be in touch shortly." });
  } catch {
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
