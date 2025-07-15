import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url'); // Get the target INPE URL from query parameter

  if (!url || typeof url !== 'string' || !url.startsWith('https://dataserver-coids.inpe.br/')) {
    return NextResponse.json({ error: 'URL inválida ou não permitida.' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        // Add any necessary headers, e.g., User-Agent, if INPE requires them
        'User-Agent': 'Mozilla/5.0 (compatible; ManusAgent/1.0; +https://manus.google.com)'
      }
    });

    if (!response.ok) {
      // Forward the status code from INPE if fetch failed
      console.error(`Falha ao buscar dados do INPE (${url}): ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Falha ao buscar dados do INPE: ${response.statusText}` }, { status: response.status });
    }

    // Get the content type and text data
    const contentType = response.headers.get('content-type') || 'application/vnd.google-earth.kml+xml'; // KML standard MIME type
    const data = await response.text();

    // Send the data back to the client
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
      },
    });

  } catch (error) {
    console.error(`Erro no proxy da API INPE (${url}):`, error);
    return NextResponse.json({ error: 'Erro interno do servidor ao buscar dados do INPE.' }, { status: 500 });
  }
}

