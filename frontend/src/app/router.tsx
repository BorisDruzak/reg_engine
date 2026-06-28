import { Route, Routes } from "react-router-dom";

import { HomePage } from "../pages/HomePage";
import { PublicLinkEditPage } from "../pages/PublicLinkEditPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/public/edit/:rawToken" element={<PublicLinkEditPage />} />
    </Routes>
  );
}
