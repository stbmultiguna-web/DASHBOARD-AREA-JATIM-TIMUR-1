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
         if (!isNaN(pLat) && !isNaN(pLng)) return { lat: pLat, lng: pLng };
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
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { url } = await request.json();
    if (!url) return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });

    let currentUrl = url;
    let redirectsCount = 0;
    const maxRedirects = 10;
    let finalUrl = url;

    while (redirectsCount < maxRedirects) {
      let response;
      try {
        response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
      } catch (err) {
        try {
          response = await fetch(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
        } catch (getErr) {
          break;
        }
      }

      const location = response.headers.get('location');
      if (location) {
        currentUrl = new URL(location, currentUrl).href;
        finalUrl = currentUrl;
        redirectsCount++;
      } else {
        break;
      }
    }

    let lat: string | null = null;
    let lng: string | null = null;
    const matchCoords3d4d = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (matchCoords3d4d) {
      lat = matchCoords3d4d[1];
      lng = matchCoords3d4d[2];
    } else {
      let parsedFromQuery = false;
      try {
        const urlObj = new URL(finalUrl);
        const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');
        if (q) {
          const qMatch = q.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
          if (qMatch) {
            lat = qMatch[1];
            lng = qMatch[2];
            parsedFromQuery = true;
          }
        }
      } catch(e) {}
      if (!parsedFromQuery) {
        const matchCoords = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (matchCoords) {
          lat = matchCoords[1];
          lng = matchCoords[2];
        }
      }
    }

    let placeName: string | null = null;
    const matchPlace = finalUrl.match(/\/place\/([^\/]+)/);
    if (matchPlace) {
      placeName = decodeURIComponent(matchPlace[1]).replace(/\+/g, ' ');
    }

    let resolvedLat = lat ? parseFloat(lat) : null;
    let resolvedLng = lng ? parseFloat(lng) : null;
    let isAiResolved = false;

    const apiKey = env.GEMINI_API_KEY;
    if (apiKey && placeName) {
      try {
        const ai = new GoogleGenAI(apiKey);
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const aiResponse = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `Berapa koordinat latitude dan longitude presisi dari tempat ini menurut database Google Maps: "${placeName}"? Berikan output dalam format JSON murni: {"lat": -8.xxxx, "lng": 114.xxxx}. Pastikan koordinat ini adalah titik pin (marker) yang sama persis dengan yang ada di Google Maps.` }] }],
          tools: [{ googleMaps: {} }]
        });
        const parsedCoords = parseCoordinatesFromText((await aiResponse.response).text() || '');
        if (parsedCoords) {
          resolvedLat = parsedCoords.lat;
          resolvedLng = parsedCoords.lng;
          isAiResolved = true;
        }
      } catch (e) {}
    }

    return new Response(JSON.stringify({
      success: true,
      finalUrl,
      lat: resolvedLat,
      lng: resolvedLng,
      placeName,
      isAiResolved
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 500 });
  }
}
