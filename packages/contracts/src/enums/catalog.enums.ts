/**
 * Catalog, Warehouse, and InstaMus Enums
 */

export enum TimeAffinity {
  DAWN = 'DAWN',
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
  LATE_NIGHT = 'LATE_NIGHT',
}

export enum WeatherAffinity {
  CLEAR_SUNNY = 'CLEAR_SUNNY',
  RAINY = 'RAINY',
  CLOUDY = 'CLOUDY',
  STORMY = 'STORMY',
  SNOW_COLD = 'SNOW_COLD',
}

export enum SeasonAffinity {
  SPRING = 'SPRING',
  SUMMER = 'SUMMER',
  MONSOON = 'MONSOON',
  AUTUMN = 'AUTUMN',
  WINTER = 'WINTER',
}

export enum WarehouseStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  HIDDEN = 'HIDDEN',
}

export enum ReelMatchStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
}

