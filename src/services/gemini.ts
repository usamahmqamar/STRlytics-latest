/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const extractReceiptData = async (base64Image: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      parts: [
        { text: `Extract expense details from this receipt image. Return a JSON object with:
          - amount (number)
          - date (YYYY-MM-DD)
          - category (one of: maintenance, utilities, supplies, marketing, other)
          - description (string)
          - vendor (string)
          - apartment_id (if identifiable, else null)` },
        { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER },
          date: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          vendor: { type: Type.STRING },
          apartment_id: { type: Type.STRING, nullable: true }
        },
        required: ["amount", "date", "category", "description", "vendor"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const getMarketIntelligence = async (location: string, bedrooms: number) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the short-term rental market for a ${bedrooms === 0 ? 'studio' : bedrooms + ' bedroom'} property in ${location}. 
    Provide realistic estimates for:
    1. Average Daily Rate (ADR) in AED
    2. Average Occupancy Rate (%)
    3. Typical annual rent for such a property in AED
    4. Typical furnishing/setup cost in AED
    5. Typical monthly operational costs (utilities, cleaning, internet) in AED
    6. Market Demand Strength (low, medium, high)
    7. Seasonality: A 12-month array of objects with { month: string, adrMultiplier: number, occMultiplier: number } 
       where multipliers are relative to the annual average.
    
    Return the data in JSON format.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          adr: { type: Type.NUMBER },
          occupancy: { type: Type.NUMBER },
          typicalRent: { type: Type.NUMBER },
          furnishingCost: { type: Type.NUMBER },
          monthlyOpEx: { type: Type.NUMBER },
          demandStrength: { type: Type.STRING, enum: ["low", "medium", "high"] },
          marketInsight: { type: Type.STRING },
          seasonality: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                month: { type: Type.STRING },
                adrMultiplier: { type: Type.NUMBER },
                occMultiplier: { type: Type.NUMBER }
              },
              required: ["month", "adrMultiplier", "occMultiplier"]
            }
          }
        },
        required: ["adr", "occupancy", "typicalRent", "furnishingCost", "monthlyOpEx", "demandStrength", "marketInsight", "seasonality"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};
