import { Route, Routes } from "react-router-dom";

import { HomePage } from "../pages/HomePage";
import { PublicCardCreationPage } from "../pages/PublicCardCreationPage";
import { PublicLinkEditPage } from "../pages/PublicLinkEditPage";
import { PublicReferenceEditPage } from "../pages/PublicReferenceEditPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/public/create/:rawToken" element={<PublicCardCreationPage />} />
      <Route path="/public/edit/:rawToken" element={<PublicLinkEditPage />} />
      <Route path="/public/references/:rawToken" element={<PublicReferenceEditPage />} />
    </Routes>
  );
}
