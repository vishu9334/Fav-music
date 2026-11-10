/** Transparent title/album keyword rules, expanded for emotive Indian musical vibes and seasonal feel. */
export class ProviderDiscoveryRules {
    private static readonly moods: Record<string, readonly string[]> = {
        Calm: ['calm', 'peaceful', 'relax', 'relaxing', 'sukoon', 'halka', 'dheeme', 'shanti'],
        Focus: ['focus', 'study', 'concentration', 'lofi', 'instrumental'],
        Happy: ['happy', 'joy', 'celebration', 'khushi', 'masti', 'nacho', 'dhamaka', 'dhol'],
        Energy: ['energy', 'energetic', 'workout', 'power', 'josh', 'party', 'dance'],
        Reflective: ['reflective', 'reflection', 'memories', 'yaad', 'yaadein', 'dard', 'tanhai', 'judai']
    };
    private static readonly seasons: Record<string, readonly string[]> = {
        SPRING: ['spring', 'blossom', 'basant', 'phool', 'rang', 'bahar', 'panchi', 'panchhi', 'bhaure', 'bhawre', 'gungunate', 'khushboo', 'titli', 'kesariya', 'mastana'],
        SUMMER: ['summer', 'sunshine', 'dhup', 'panchi', 'panchhi', 'sur', 'gaate', 'gate', 'bhaure', 'bhawre', 'gungunate', 'taaza', 'taazgi', 'fresh', 'breeze', 'hawa', 'subah', 'suraj', 'chandan', 'wadiyan', 'dhoop'],
        MONSOON: ['monsoon', 'rain', 'rainy', 'barsaat', 'sawan', 'saawan', 'baarish', 'rimjhim', 'badal', 'boondein', 'tip', 'cham', 'megha', 'barso', 'bheegi', 'pani', 'paani', 'ghana', 'ghanan'],
        AUTUMN: ['autumn', 'fall', 'patjhad', 'shaam', 'sunset', 'safarnama', 'safar', 'musafir', 'muskurane', 'khamoshiyan', 'yaadein', 'hawa', 'patte'],
        WINTER: ['winter', 'snow', 'snowfall', 'sardi', 'thand', 'thandi', 'cozy', 'bonfire', 'sukoon', 'channa', 'kabira', 'tum', 'agar', 'chupke', 'dhundh', 'kohra', 'raat', 'sheetal']
    };
    private static readonly times: Record<string, readonly string[]> = {
        MORNING: ['morning', 'sunrise', 'dawn', 'subah', 'savera', 'prabhat'],
        AFTERNOON: ['afternoon', 'noon', 'dopahar'],
        EVENING: ['evening', 'sunset', 'shaam', 'sanjh'],
        LATE_NIGHT: ['night', 'midnight', 'raat', 'nisha']
    };
    public static tags(title: string, album: string | undefined): {
        moods: string[];
        seasonAffinities: string[];
        timeAffinities: string[];
    } {
        const words = new Set(`${title} ${album ?? ''}`.normalize('NFKC').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
        const match = (rules: Record<string, readonly string[]>) => Object.entries(rules).filter(([, keywords]) => keywords.some(word => words.has(word))).map(([tag]) => tag);
        return { moods: match(this.moods), seasonAffinities: match(this.seasons), timeAffinities: match(this.times) };
    }
    public static query(mood?: string, season?: string): string | undefined {
        if (mood && this.moods[mood]) return this.moods[mood]![0];
        const key = season ? season.toUpperCase() : undefined;
        if (key && this.seasons[key]) {
            if (key === 'SUMMER') return 'Bollywood Summer';
            if (key === 'MONSOON') return 'Monsoon Hits';
            if (key === 'WINTER') return 'Winter Bollywood';
            if (key === 'SPRING') return 'Basant Bollywood';
            if (key === 'AUTUMN') return 'Safarnama Bollywood';
            return this.seasons[key]![0];
        }
        return undefined;
    }
}
