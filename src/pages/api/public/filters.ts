import type { APIRoute } from "astro";

// Mock data for preview
const mockSports = [
  { id: "1", name: "Soccer", slug: "soccer", icon: "⚽", color: "#22c55e" },
  { id: "2", name: "Basketball", slug: "basketball", icon: "🏀", color: "#f97316" },
  { id: "3", name: "Football", slug: "football", icon: "🏈", color: "#8b4513" },
  { id: "4", name: "Baseball", slug: "baseball", icon: "⚾", color: "#dc2626" },
];

const mockLocations = [
  { id: "1", name: "Powell", slug: "powell", city: "Powell", state: "OH" },
  { id: "2", name: "Dublin", slug: "dublin", city: "Dublin", state: "OH" },
  { id: "3", name: "Delaware", slug: "delaware", city: "Delaware", state: "OH" },
];

export const GET: APIRoute = async () => {
  // Return mock data for preview
  return new Response(
    JSON.stringify({
      sports: mockSports,
      locations: mockLocations,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
