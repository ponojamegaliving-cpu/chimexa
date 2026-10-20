import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";

const SERVER_URL_KEY = "realtor-app-server-url";

function getSuggestedServerUrl() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  return host ? `http://${host}:5000` : "http://10.0.2.2:5000";
}

function normalizeServerUrl(value) {
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use an HTTP or HTTPS server address.");
  }
  return parsed.origin;
}

function isSameOrigin(firstUrl, secondUrl) {
  try {
    return new URL(firstUrl).origin === new URL(secondUrl).origin;
  } catch {
    return false;
  }
}

export default function App() {
  const webView = useRef(null);
  const [serverUrl, setServerUrl] = useState(getSuggestedServerUrl);
  const [draftUrl, setDraftUrl] = useState(getSuggestedServerUrl);
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [urlError, setUrlError] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(SERVER_URL_KEY)
      .then((savedUrl) => {
        if (!savedUrl) return;
        setServerUrl(savedUrl);
        setDraftUrl(savedUrl);
        setConnected(true);
        setShowSettings(false);
      })
      .catch((error) => {
        console.warn("Could not load the saved server address.", error);
      });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = require("react-native").BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showSettings) {
          if (connected) setShowSettings(false);
          return true;
        }
        if (canGoBack) {
          webView.current?.goBack();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [canGoBack, connected, showSettings]);

  function connect() {
    try {
      const normalizedUrl = normalizeServerUrl(draftUrl);
      setUrlError("");
      setLoadError("");
      setServerUrl(normalizedUrl);
      setConnected(true);
      setShowSettings(false);
      AsyncStorage.setItem(SERVER_URL_KEY, normalizedUrl).catch((error) => {
        console.warn("Could not save the server address.", error);
      });
    } catch (error) {
      setUrlError(error.message || "Enter a valid server address.");
    }
  }

  function openExternalUrl(url) {
    Linking.openURL(url).catch((error) => {
      setLoadError(`Could not open this link: ${error.message}`);
    });
  }

  if (showSettings || !connected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f7f8fa" />
        <ExpoStatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={styles.setupCard}>
            <Text style={styles.eyebrow}>CRYSTAL GARDEN PROPERTY MARKETPLACE</Text>
            <Text style={styles.title}>Connect to your server</Text>
            <Text style={styles.description}>
              Enter the address where the property marketplace is running. For a local server, use your
              computer&apos;s Wi-Fi IP address, such as http://192.168.1.25:5000.
            </Text>
            <Text style={styles.label}>Server address</Text>
            <TextInput
              accessibilityLabel="Server address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) => {
                setDraftUrl(value);
                setUrlError("");
              }}
              onSubmitEditing={connect}
              placeholder="http://192.168.1.25:5000"
              placeholderTextColor="#7b8492"
              returnKeyType="go"
              style={[styles.input, urlError ? styles.inputError : null]}
              value={draftUrl}
            />
            {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}
            <Pressable accessibilityRole="button" onPress={connect} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Connect</Text>
            </Pressable>
            {connected ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowSettings(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Text style={styles.hint}>
              Keep your phone and computer on the same Wi-Fi network, and allow Node.js through
              Windows Firewall if asked.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <ExpoStatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Property Marketplace</Text>
          <Text numberOfLines={1} style={styles.serverAddress}>
            {serverUrl}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraftUrl(serverUrl);
            setUrlError("");
            setShowSettings(true);
          }}
          style={styles.settingsButton}
        >
          <Text style={styles.settingsButtonText}>Server</Text>
        </Pressable>
      </View>
      {loadError ? (
        <View style={styles.connectionError}>
          <Text style={styles.errorTitle}>Could not load the app</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>
            Check that the server is running and that this address is reachable from your phone.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoadError("");
              webView.current?.reload();
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webViewContainer}>
          <WebView
            ref={webView}
            source={{ uri: `${serverUrl}/properties.html` }}
            originWhitelist={["http://*", "https://*"]}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            onLoadStart={() => {
              setIsLoading(true);
              setLoadError("");
            }}
            onLoadEnd={() => setIsLoading(false)}
            onError={(event) => {
              setIsLoading(false);
              setLoadError(event.nativeEvent.description || "The server could not be reached.");
            }}
            onHttpError={(event) => {
              setIsLoading(false);
              setLoadError(`The server returned HTTP ${event.nativeEvent.statusCode}.`);
            }}
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
            onShouldStartLoadWithRequest={(request) => {
              if (request.isTopFrame === false || isSameOrigin(request.url, serverUrl)) return true;
              openExternalUrl(request.url);
              return false;
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color="#176b56" size="large" />
                <Text style={styles.loadingText}>Connecting…</Text>
              </View>
            )}
            style={styles.webView}
          />
          {isLoading ? (
            <View pointerEvents="none" style={styles.loadingIndicator}>
              <ActivityIndicator color="#176b56" size="small" />
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fa",
  },
  screen: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  setupCard: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 24,
    shadowColor: "#17212b",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  eyebrow: {
    color: "#176b56",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    color: "#17212b",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
  },
  description: {
    color: "#505b69",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  label: {
    color: "#17212b",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd2dc",
    borderRadius: 10,
    borderWidth: 1,
    color: "#17212b",
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: "#c0392b",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176b56",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 50,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    minHeight: 42,
  },
  cancelButtonText: {
    color: "#505b69",
    fontSize: 15,
    fontWeight: "600",
  },
  hint: {
    color: "#687383",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
  },
  errorText: {
    color: "#a92b20",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e5e8ec",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 60,
    paddingHorizontal: 16,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    color: "#17212b",
    fontSize: 16,
    fontWeight: "700",
  },
  serverAddress: {
    color: "#687383",
    fontSize: 12,
    marginTop: 2,
  },
  settingsButton: {
    backgroundColor: "#edf4f1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  settingsButtonText: {
    color: "#176b56",
    fontSize: 14,
    fontWeight: "700",
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
  },
  loading: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: "#505b69",
    fontSize: 14,
    marginTop: 12,
  },
  loadingIndicator: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 8,
    position: "absolute",
    right: 14,
    top: 14,
  },
  connectionError: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: "#17212b",
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 10,
  },
  errorHint: {
    color: "#505b69",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
});
