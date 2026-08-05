/**
 * @file ErrorEventTabs davranış testleri.
 * @module @vetniva/web/components/superadmin/error-event-tabs.test
 * @description İki sekme arasında geçiş, klavye etkileşimi ve ARIA
 * attribute'larının doğru ayarlandığını kontrol eder.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ErrorEventTabs } from "./error-event-tabs";

const LABELS = { list: "Liste", groups: "Gruplar (fingerprint)" };

describe("ErrorEventTabs", () => {
  it("happy-path: ilk sekme aktifken liste içeriğini gösterir", () => {
    render(
      <ErrorEventTabs
        activeTab="list"
        groupsContent={<p>groups-content</p>}
        labels={LABELS}
        listContent={<p>list-content</p>}
        onTabChange={() => undefined}
      />,
    );

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const listTab = screen.getByRole("tab", { name: LABELS.list });
    const groupsTab = screen.getByRole("tab", { name: LABELS.groups });
    expect(listTab).toHaveAttribute("aria-selected", "true");
    expect(groupsTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("list-content")).toBeInTheDocument();
    expect(screen.queryByText("groups-content")).not.toBeInTheDocument();
  });

  it("tıklama ile sekme değiştirir ve doğru callback çağrılır", () => {
    const onChange = vi.fn();
    render(
      <ErrorEventTabs
        activeTab="list"
        groupsContent={<p>groups-content</p>}
        labels={LABELS}
        listContent={<p>list-content</p>}
        onTabChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: LABELS.groups }));
    expect(onChange).toHaveBeenCalledWith("groups");
  });

  it("klavye: sağ ok tuşu sonraki sekmeye geçirir", () => {
    const onChange = vi.fn();
    render(
      <ErrorEventTabs
        activeTab="list"
        groupsContent={<p>groups-content</p>}
        labels={LABELS}
        listContent={<p>list-content</p>}
        onTabChange={onChange}
      />,
    );

    const listTab = screen.getByRole("tab", { name: LABELS.list });
    listTab.focus();
    fireEvent.keyDown(listTab, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("groups");
  });

  it("error-path: 'groups' aktifken grup içeriği gösterilir", () => {
    render(
      <ErrorEventTabs
        activeTab="groups"
        groupsContent={<p>groups-content</p>}
        labels={LABELS}
        listContent={<p>list-content</p>}
        onTabChange={() => undefined}
      />,
    );

    const groupsTab = screen.getByRole("tab", { name: LABELS.groups });
    expect(groupsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("groups-content")).toBeInTheDocument();
    expect(screen.queryByText("list-content")).not.toBeInTheDocument();
  });
});
