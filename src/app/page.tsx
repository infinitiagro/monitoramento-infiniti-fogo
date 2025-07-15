
'use client'; // Mark this as a client component

import React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image'; // Import Image component

// Dynamically import the MapComponent to ensure it only runs on the client-side
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false, // Disable server-side rendering for this component
  loading: () => <p>Carregando mapa...</p> // Optional loading indicator
});

export default function Home() {
  // Define initial map center (e.g., somewhere in Brazil)
  const initialCenter: [number, number] = [-14.2350, -51.9253];
  const initialZoom = 5; // Adjusted zoom level for better initial view

  return (
    <main className="flex flex-col h-screen w-screen">
      {/* Header with Logo */}
      <header className="bg-header-background p-2 shadow-md z-10 flex items-center">
        <Image
          src="/logo.png" // Path to the logo in the public folder
          alt="Agropecuária Infiniti Logo"
          width={100} // Adjust width as needed
          height={10} // Adjust height as needed
          priority // Prioritize loading the logo
        />
          {/* AQUI ESTÁ A MUDANÇA PRINCIPAL: flex-col e ml-4 */}
          <div className="flex flex-col ml-4">
            <h1 className="text-lg font-semibold text-black-700">Monitoramento de Incêndios Florestais</h1>
            <p className="text-xs text-black-500 mt-0.5">Desenvolvido por ForestryLab - Inovações e Tecnologias Florestais</p>
            <p className="text-xs text-black-500 mt-0.5"><a href="http://www.forestrylab.com.br" target="_blank" rel="noopener noreferrer">www.forestrylab.com.br</a></p>
          </div>
      </header>

      {/* Map Container */}
      <div className="flex-grow relative">
        <MapComponent center={initialCenter} zoom={initialZoom} />
      </div>
    </main>
  );
}

