import { GoogleGenAI } from '@google/genai';

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { prompt, previousContent } = await request.json();
    const apiKey = env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY environment variable is required." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: "Anda adalah AI Assistant Dashboard Profit Margin Area Jatim Timur. Tugas Anda membantu memberikan panduan analitik, serta memanfaatkan tool Google Maps (Maps Grounding) jika user membutuhkan informasi koordinat, lokasi gedung Jatim Timur, atau rute untuk verifikasi lapangan."
    }, {
       apiVersion: 'v1beta',
       headers: { 'User-Agent': 'aistudio-build' }
    });

    // Assemble contents. Support multi-turn if previousContent exists.
    let contents = [];
    if (previousContent && Array.isArray(previousContent)) {
       contents = previousContent.map(item => {
         if (typeof item === 'string') {
           return { role: 'user', parts: [{ text: item }] };
         }
         return item;
       });
       contents.push({ role: 'user', parts: [{ text: prompt }] });
    } else {
       contents = [{ role: 'user', parts: [{ text: prompt }] }];
    }

    const result = await model.generateContent({
      contents,
      tools: [{ googleMaps: {} }],
    });

    const response = await result.response;
    return new Response(JSON.stringify({ 
      text: response.text(), 
      modelTurn: response.candidates?.[0]?.content 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error("Gemini API Error:", e);
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
