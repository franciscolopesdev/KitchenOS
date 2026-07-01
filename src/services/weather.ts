import dotenv from 'dotenv';

dotenv.config();

const defaultLat = -23.5505; // São Paulo
const defaultLon = -46.6333;

const wmoWeatherCodes: Record<number, string> = {
  0: 'Céu limpo ☀️',
  1: 'Principalmente limpo 🌤️',
  2: 'Parcialmente nublado ⛅',
  3: 'Encoberto ☁️',
  45: 'Nevoeiro 🌫️',
  48: 'Nevoeiro com depósito de geada 🌫️',
  51: 'Chuvisco leve 🌧️',
  53: 'Chuvisco moderado 🌧️',
  55: 'Chuvisco denso 🌧️',
  56: 'Chuvisco leve e congelante 🌨️',
  57: 'Chuvisco denso e congelante 🌨️',
  61: 'Chuva fraca 🌧️',
  63: 'Chuva moderada 🌧️',
  65: 'Chuva forte 🌧️',
  66: 'Chuva leve e congelante 🌨️',
  67: 'Chuva forte e congelante 🌨️',
  71: 'Queda de neve leve ❄️',
  73: 'Queda de neve moderada ❄️',
  75: 'Queda de neve forte ❄️',
  77: 'Grãos de neve ❄️',
  80: 'Pancadas de chuva leves 🌦️',
  81: 'Pancadas de chuva moderadas 🌦️',
  82: 'Pancadas de chuva violentas ⛈️',
  85: 'Pancadas de neve leves 🌨️',
  86: 'Pancadas de neve fortes 🌨️',
  95: 'Tempestade leve ou moderada ⛈️',
  96: 'Tempestade com granizo leve ⛈️',
  99: 'Tempestade com granizo forte ⛈️',
};

export interface WeatherInfo {
  temperature: number;
  description: string;
  isCold: boolean;
  isHot: boolean;
  isRainy: boolean;
  rawCode: number;
}

export async function getCurrentWeather(): Promise<WeatherInfo> {
  const lat = process.env.WEATHER_LATITUDE ? parseFloat(process.env.WEATHER_LATITUDE) : defaultLat;
  const lon = process.env.WEATHER_LONGITUDE ? parseFloat(process.env.WEATHER_LONGITUDE) : defaultLon;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo returned status ${response.status}`);
    }

    const data: any = await response.json();
    if (!data.current) {
      throw new Error('No current weather data found');
    }

    const temp = data.current.temperature_2m;
    const code = data.current.weather_code;
    const description = wmoWeatherCodes[code] || 'Clima desconhecido';

    const isCold = temp < 18;
    const isHot = temp > 28;
    const isRainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);

    return {
      temperature: temp,
      description,
      isCold,
      isHot,
      isRainy,
      rawCode: code,
    };
  } catch (error: any) {
    console.warn(`Failed to fetch weather: ${error.message}. Returning default pleasant weather.`);
    return {
      temperature: 22,
      description: 'Céu limpo ☀️ (Dados mockados)',
      isCold: false,
      isHot: false,
      isRainy: false,
      rawCode: 0,
    };
  }
}
