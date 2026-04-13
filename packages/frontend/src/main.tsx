
  import { createRoot } from "react-dom/client";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { ZerosAuthProvider } from "@0zerosdesign/auth-client/react";
  import App from "./App.tsx";
  import "./styles/globals.css";

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <ZerosAuthProvider config={{ productId: "0colors" }}>
        <App />
      </ZerosAuthProvider>
    </QueryClientProvider>
  );
