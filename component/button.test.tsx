import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("shadcn Button", () => {
  test("renders its accessible name and handles a click", () => {
    const onClick = mock(() => undefined);
    const { container } = render(
      <Button type="button" variant="secondary" onClick={onClick}>
        保存设置
      </Button>,
    );

    fireEvent.click(within(container).getByRole("button", { name: "保存设置" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
