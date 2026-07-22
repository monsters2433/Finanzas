/**
 * Cliente de API de Ciclo para el navegador.
 * Uso:  const api = CicloAPI("https://ciclo-api.tu-subdominio.workers.dev");
 * Las cookies de sesión viajan solas gracias a credentials:"include".
 */
(function (global) {
  "use strict";

  function CicloAPI(base) {
    base = (base || "").replace(/\/$/, "");

    async function req(method, path, body) {
      const res = await fetch(base + path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status, data });
      return data;
    }

    return {
      // --- auth ---
      signup: (p) => req("POST", "/api/auth/signup", p), // {name,email,password,country,currency,locale}
      login: (p) => req("POST", "/api/auth/login", p), // {email,password}
      logout: () => req("POST", "/api/auth/logout"),
      me: () => req("GET", "/api/auth/me"),
      updateProfile: (p) => req("PATCH", "/api/auth/me", p), // {preferences?,currency?,name?}

      // --- estado completo (para hidratar la app al arrancar) ---
      getState: () => req("GET", "/api/state"),

      // --- pagos / suscripciones ---
      createSub: (s) => req("POST", "/api/subscriptions", s),
      updateSub: (id, s) => req("PATCH", "/api/subscriptions/" + id, s),
      deleteSub: (id) => req("DELETE", "/api/subscriptions/" + id),

      // --- ingresos ---
      createIncome: (i) => req("POST", "/api/incomes", i),
      updateIncome: (id, i) => req("PATCH", "/api/incomes/" + id, i),
      deleteIncome: (id) => req("DELETE", "/api/incomes/" + id),

      // --- gastos ---
      createExpense: (g) => req("POST", "/api/expenses", g),
      updateExpense: (id, g) => req("PATCH", "/api/expenses/" + id, g),
      deleteExpense: (id) => req("DELETE", "/api/expenses/" + id),

      // --- metas de ahorro ---
      createGoal: (g) => req("POST", "/api/goals", g), // {emoji,name,target}
      deleteGoal: (id) => req("DELETE", "/api/goals/" + id),
      addContribution: (goalId, amount, date) => req("POST", "/api/goals/" + goalId + "/contributions", { amount, date }),

      // --- pagos (Stripe) ---
      checkout: (priceId) => req("POST", "/api/billing/checkout", { priceId }),
    };
  }

  global.CicloAPI = CicloAPI;
})(typeof window !== "undefined" ? window : this);
