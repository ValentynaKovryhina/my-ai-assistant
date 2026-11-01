import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { listCategories } from "@/lib/tasks/queries";
import { CategoryManager } from "../_components/category-manager";
import { PageBody, PageHeader, PageShell, Skeleton } from "../_components/ui";

export const metadata: Metadata = {
  title: "Categories",
};

export default function CategoriesPage() {
  return (
    <PageShell>
      <PageHeader title="Categories" backHref="/tasks" backLabel="Back to tasks" />
      <PageBody>
        <Suspense fallback={<Skeleton rows={2} label="Loading categories" />}>
          <Categories />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

async function Categories() {
  await requireUser();
  return <CategoryManager categories={await listCategories()} />;
}
