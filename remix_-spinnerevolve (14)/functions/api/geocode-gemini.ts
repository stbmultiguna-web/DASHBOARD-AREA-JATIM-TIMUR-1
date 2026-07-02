import { GoogleGenAI } from '@google/genai';

function parseCoordinatesFromText(text: string): { lat: number; lng: number } | null {
  if (!text) return null;
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/[\u201C\u201D\u2018\u2019]/g, '"');
      const parsed = JSON.parse(cleanJson);
      const lat = parsed.lat !== undefined ? parsed.lat : parsed.latitude;
      const lng = parsed.lng !== undefined ? parsed.lng : parsed.longitude;
      
      if (lat !== undefined && lng !== undefined) {
         const pLat = typeof lat === 'number' ? lat : parseFloat(String(lat).replace(',', '.'));
         const pLng = typeof lng === 'number' ? lng : parseFloat(String(lng).replace(',', '.'));
         if (!isNaN(pLat) && !isNaN(pLng)) {
           return { lat: pLat, lng: pLng };
         }
      }
    }
  } catch (e) {}

  const patterns = [
    /(?:"lat"|lat)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*,\s*(?:"lng"|lng)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
    /(?:"latitude"|latitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*,\s*(?:"longitude"|longitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
    /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { query } = await request.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY environment variable is required." }), { status: 500 });
    }

    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Berapa koordinat latitude dan longitude presisi dari tempat / lokasi / alamat ini menurut database Google Maps: "${query}"? Berikan output dalam format JSON murni: {"lat": -8.xxxx, "lng": 114.xxxx}. Pastikan koordinat ini adalah titik pin (marker) yang sama persis dengan yang ada di Google Maps.` }] }],
      tools: [{ googleMaps: {} }]
    });

    const responseText = (await result.response).text() || '';
    const parsedCoords = parseCoordinatesFromText(responseText);
    
    if (parsedCoords) {
      return new Response(JSON.stringify({
        success: true,
        lat: parsedCoords.lat,
        lng: parsedCoords.lng
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Gagal mengurai koordinat dari respon AI.`);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 500 });
  }
}
