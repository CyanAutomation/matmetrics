import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';

type LogDoctorRepositoryTargetProps = {
  owner: string;
  repo: string;
  branch: string;
  onOwnerChange: (value: string) => void;
  onRepoChange: (value: string) => void;
  onBranchChange: (value: string) => void;
};

export function LogDoctorRepositoryTarget({
  owner,
  repo,
  branch,
  onOwnerChange,
  onRepoChange,
  onBranchChange,
}: LogDoctorRepositoryTargetProps) {
  return (
    <PluginSectionCard
      title={<span className="text-base">Repository target</span>}
      contentClassName="grid gap-3 md:grid-cols-3"
    >
      <div className="space-y-1">
        <Label htmlFor="log-doctor-owner">Owner</Label>
        <Input
          id="log-doctor-owner"
          value={owner}
          onChange={(event) => onOwnerChange(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="log-doctor-repo">Repository</Label>
        <Input
          id="log-doctor-repo"
          value={repo}
          onChange={(event) => onRepoChange(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="log-doctor-branch">Branch (optional)</Label>
        <Input
          id="log-doctor-branch"
          value={branch}
          onChange={(event) => onBranchChange(event.target.value)}
        />
      </div>
    </PluginSectionCard>
  );
}
