import { WarehouseStatus } from '../enums/catalog.enums.js';
import { TrackDto } from './catalog.dto.js';

export interface WarehouseItemDto {
  id: string;
  userId: string;
  trackId: string;
  track: TrackDto;
  status: WarehouseStatus;
  isFavorite: boolean;
  listenCount: number;
  skipCount: number;
  archivedAt: string | null;
  addedAt: string;
}

export interface UpdateWarehouseStatusDto {
  trackId: string;
  status: WarehouseStatus;
}

