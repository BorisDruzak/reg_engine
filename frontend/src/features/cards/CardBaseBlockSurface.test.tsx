import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CardBaseBlockSurface } from "./CardBaseBlockSurface";

describe("CardBaseBlockSurface", () => {
  test("renders public metadata as output without editable controls", () => {
    render(
      <CardBaseBlockSurface
        id="card-base-block"
        mode="public"
        organization={{ label: "Организация карточки", value: "Администрация" }}
        template={{ label: "Шаблон карточки", value: "Муниципальный служащий" }}
        displayName={{ label: "Наименование карточки", value: "Карточка" }}
      />,
    );

    expect(screen.getByText("Администрация")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Организация карточки" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Наименование карточки" }),
    ).not.toBeInTheDocument();
  });

  test("keeps public access collapsed until it is opened", () => {
    render(
      <CardBaseBlockSurface
        id="card-base-block"
        mode="admin"
        organization={{ label: "Организация карточки", value: "Администрация" }}
        template={{ label: "Шаблон карточки", value: "Муниципальный служащий" }}
        displayName={{ label: "Наименование карточки", value: "Карточка" }}
        publicAccessContent={<p>Настройки доступа</p>}
      />,
    );

    const access = screen.getByText("Публичный доступ").closest("details");
    expect(access).not.toHaveAttribute("open");
    expect(screen.queryByText("Настройки доступа")).not.toBeVisible();
  });

  test("renders the server-provided creator in the authenticated base block", () => {
    render(
      <CardBaseBlockSurface
        id="card-base-block"
        mode="admin"
        organization={{ label: "Организация", value: "Администрация" }}
        template={{ label: "Шаблон", value: "Муниципальный служащий" }}
        displayName={{ label: "Карточка", value: "Карточка" }}
        creator={{ label: "Создатель", value: "Иванов Иван Иванович" }}
      />,
    );

    expect(screen.getByText("Создатель")).toBeVisible();
    expect(screen.getByText("Иванов Иван Иванович")).toBeVisible();
  });
});
