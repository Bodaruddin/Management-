import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useDbSetup } from "@/context/DbSetupContext";

export default function Index() {
  const { user, isLoading } = useAuth();
  const { isSetupComplete } = useDbSetup();

  // Wait for persisted auth before choosing a route. This prevents the login
  // screen from flashing while AsyncStorage and the DB status are loading.
  if (isLoading || (user && isSetupComplete === null)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  if (user.role === "admin") {
    return <Redirect href={isSetupComplete ? "/(tabs)" : "/db-setup"} />;
  }

  return <Redirect href={isSetupComplete ? "/teacher" : "/login"} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
});
