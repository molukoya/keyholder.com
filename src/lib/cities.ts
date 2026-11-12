import type { Province } from '../data/types';

// Approximate centres of Canadian cities (2 decimals ≈ 1 km), for the support dashboard's map. Only city-level
// positions are ever shown: never a landlord's street address. A city not in this list is shown at a point
// for "elsewhere in" its province.

type LatLng = [lat: number, lng: number];
const C: Record<Province, Record<string, LatLng>> = {
  ON: {
    Toronto: [43.65, -79.38], Ottawa: [45.42, -75.7], Hamilton: [43.26, -79.87], Mississauga: [43.59, -79.64], Brampton: [43.73, -79.76],
    London: [42.98, -81.25], Kitchener: [43.45, -80.49], Waterloo: [43.46, -80.52], Windsor: [42.31, -83.04], Markham: [43.86, -79.34],
    Vaughan: [43.84, -79.5], Oakville: [43.45, -79.69], Burlington: [43.33, -79.8], Oshawa: [43.9, -78.86], Barrie: [44.39, -79.69],
    Guelph: [43.55, -80.25], Kingston: [44.23, -76.49], Sudbury: [46.49, -80.99], 'Greater Sudbury': [46.49, -80.99], 'Thunder Bay': [48.38, -89.25],
    'St. Catharines': [43.16, -79.24], 'Niagara Falls': [43.09, -79.08], Cambridge: [43.36, -80.31], Peterborough: [44.31, -78.32],
    'Sault Ste. Marie': [46.52, -84.33], 'Richmond Hill': [43.88, -79.44], Whitby: [43.88, -78.94], Ajax: [43.85, -79.02], Pickering: [43.84, -79.09],
    'North Bay': [46.31, -79.46], Belleville: [44.16, -77.38], Brantford: [43.14, -80.26], Milton: [43.52, -79.88], Newmarket: [44.06, -79.46],
  },
  BC: {
    Vancouver: [49.28, -123.12], Victoria: [48.43, -123.37], Surrey: [49.19, -122.85], Burnaby: [49.25, -122.98], Richmond: [49.17, -123.14],
    Kelowna: [49.89, -119.5], Abbotsford: [49.05, -122.33], Coquitlam: [49.28, -122.79], Langley: [49.1, -122.66], Nanaimo: [49.17, -123.94],
    Kamloops: [50.67, -120.33], 'Prince George': [53.92, -122.75], Chilliwack: [49.16, -121.95], Vernon: [50.27, -119.27], Penticton: [49.49, -119.59],
    'North Vancouver': [49.32, -123.07], 'New Westminster': [49.21, -122.91], Delta: [49.08, -123.06],
  },
  AB: {
    Calgary: [51.05, -114.07], Edmonton: [53.55, -113.49], 'Red Deer': [52.27, -113.81], Lethbridge: [49.69, -112.84], 'St. Albert': [53.63, -113.63],
    'Medicine Hat': [50.04, -110.68], 'Grande Prairie': [55.17, -118.8], Airdrie: [51.29, -114.01], 'Fort McMurray': [56.73, -111.38],
    'Spruce Grove': [53.54, -113.91], Okotoks: [50.73, -113.98], Canmore: [51.09, -115.36], 'Sherwood Park': [53.54, -113.32],
  },
  QC: {
    'Montréal': [45.5, -73.57], 'Québec': [46.81, -71.21], Gatineau: [45.48, -75.7], Laval: [45.61, -73.71], Longueuil: [45.53, -73.52],
    Sherbrooke: [45.4, -71.89], Saguenay: [48.43, -71.07], 'Lévis': [46.8, -71.18], 'Trois-Rivières': [46.35, -72.55], Terrebonne: [45.7, -73.65],
    Drummondville: [45.88, -72.48], 'Saint-Jérôme': [45.78, -74.0], Granby: [45.4, -72.73], Rimouski: [48.45, -68.52], Brossard: [45.46, -73.47], Repentigny: [45.74, -73.45],
  },
  MB: { Winnipeg: [49.9, -97.14], Brandon: [49.85, -99.95], Steinbach: [49.53, -96.68], Thompson: [55.74, -97.86], 'Portage la Prairie': [49.97, -98.29], Winkler: [49.18, -97.94], Selkirk: [50.14, -96.88] },
  SK: { Saskatoon: [52.13, -106.67], Regina: [50.45, -104.61], 'Prince Albert': [53.2, -105.75], 'Moose Jaw': [50.39, -105.53], 'Swift Current': [50.29, -107.8], Yorkton: [51.21, -102.46], 'North Battleford': [52.76, -108.29] },
  NS: { Halifax: [44.65, -63.58], Dartmouth: [44.67, -63.57], Sydney: [46.14, -60.19], Truro: [45.37, -63.28], 'New Glasgow': [45.59, -62.65], Kentville: [45.08, -64.5], Bridgewater: [44.38, -64.52], Yarmouth: [43.84, -66.12], Wolfville: [45.09, -64.36], Antigonish: [45.62, -61.99] },
  NB: { Moncton: [46.09, -64.78], 'Saint John': [45.27, -66.06], Fredericton: [45.96, -66.64], Dieppe: [46.08, -64.69], Miramichi: [47.03, -65.5], Edmundston: [47.37, -68.33], Bathurst: [47.62, -65.65], Riverview: [46.06, -64.81] },
  NL: { "St. John's": [47.56, -52.71], 'Mount Pearl': [47.52, -52.81], 'Corner Brook': [48.95, -57.95], 'Conception Bay South': [47.5, -52.99], Paradise: [47.53, -52.87], 'Grand Falls-Windsor': [48.93, -55.65], Gander: [48.95, -54.61], 'Happy Valley-Goose Bay': [53.3, -60.42] },
  PE: { Charlottetown: [46.24, -63.13], Summerside: [46.39, -63.79], Stratford: [46.22, -63.09], Cornwall: [46.23, -63.22] },
  YT: { Whitehorse: [60.72, -135.06], 'Dawson City': [64.06, -139.43] },
  NT: { Yellowknife: [62.45, -114.37], 'Hay River': [60.82, -115.8], Inuvik: [68.36, -133.72] },
  NU: { Iqaluit: [63.75, -68.52], 'Rankin Inlet': [62.81, -92.09], 'Cambridge Bay': [69.12, -105.06] },
};
/** Where "elsewhere in" a province is drawn: inside its main populated area. */
const ELSEWHERE: Record<Province, LatLng> = {
  ON: [44.5, -79.0], BC: [49.7, -121.0], AB: [52.4, -113.5], QC: [46.3, -72.6], MB: [50.4, -97.6], SK: [51.5, -105.8], NS: [45.0, -63.6],
  NB: [46.4, -66.0], NL: [48.6, -55.5], PE: [46.3, -63.4], YT: [61.5, -135.5], NT: [62.6, -115.5], NU: [64.2, -80.0],
};
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(city of|ville de) /, '').replace(/ city$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ALIAS: Record<string, string> = { montreal: 'Montréal', quebec: 'Québec', 'quebec city': 'Québec', levis: 'Lévis', 'trois rivieres': 'Trois-Rivières', 'saint jerome': 'Saint-Jérôme', 'st johns': "St. John's", 'st catharines': 'St. Catharines', 'sault ste marie': 'Sault Ste. Marie', 'st albert': 'St. Albert' };

/** A city's point on the map, by province and name (accents and "City of" ignored); `exact` is false for "elsewhere". */
export function cityPoint(province: string, city: string): { lat: number; lng: number; exact: boolean; name: string } | null {
  const p = province as Province;
  const list = C[p];
  if (!list) return null;
  const f = fold(city ?? '');
  const name = ALIAS[f] ?? Object.keys(list).find((n) => fold(n) === f);
  if (name && list[name]) return { lat: list[name][0], lng: list[name][1], exact: true, name };
  return { lat: ELSEWHERE[p][0], lng: ELSEWHERE[p][1], exact: false, name: 'Elsewhere' };
}
