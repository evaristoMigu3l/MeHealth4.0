import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useUserStore } from '../stores/useUserStore';
import { useCloudStore } from '../stores/useCloudStore';

export default function Index() {
    const profile = useUserStore((state) => state.profile);
    const syncStatus = useCloudStore((state) => state.syncStatus);
    const authStatus = useCloudStore((state) => state.authStatus);

    // While the session is being restored, cloud data is loading, OR the
    // user is signed out, we must NOT decide where to route here. When
    // signed out the root layout's auth-gate owns navigation (it replaces
    // to /auth). If index also rendered <Redirect href="/onboarding"> at
    // that moment (profile is null when signed out), the two navigations
    // would race and the screen would flicker/bounce between routes.
    if (
        authStatus === 'initializing' ||
        authStatus === 'signedOut' ||
        syncStatus === 'loading'
    ) {
        return <View style={{ flex: 1 }} />;
    }

    // A brand-new account gets an empty profiles row (DB trigger), so
    // "has profile" means "has a name" — otherwise go to onboarding.
    return <Redirect href={profile?.name ? "/(tabs)" : "/onboarding"} />;
}
