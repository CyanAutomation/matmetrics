import React from 'react';

export const LogDoctor = (): React.ReactElement => {
  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <h2 className="text-lg font-semibold">Log Doctor</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Log diagnostics will appear here once the plugin checks are configured.
      </p>
    </section>
  );
};
