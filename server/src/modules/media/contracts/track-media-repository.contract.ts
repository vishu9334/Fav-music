export interface ITrackMediaEntity {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly audioKey: string;
  readonly videoKey: string | null;
  readonly artworkKey: string;
  readonly licenseExpiresAt?: Date | null;
}

export interface ITrackMediaRepository {
  findById(id: string): Promise<ITrackMediaEntity | null>;
  findByAudioKey(audioKey: string): Promise<ITrackMediaEntity | null>;
}

