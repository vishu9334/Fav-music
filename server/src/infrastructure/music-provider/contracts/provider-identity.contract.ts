export interface ProviderReference {
    readonly provider: string;
    readonly kind: 'song' | 'albums' | 'artists' | 'playlists';
    readonly externalId: string;
}
/** A reviewed crosswalk can bind another provider to an existing canonical UUID; titles are never identity keys. */
export interface IProviderIdentityRepository {
    remember(reference: ProviderReference): Promise<string>;
    find(id: string): Promise<ProviderReference | null>;
}
