export interface ITrackLookupEntity {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly durationSeconds: number;
  readonly publishStatus: string;
}

export interface ITrackLookupRepository {
  findById(id: string): Promise<ITrackLookupEntity | null>;
}

