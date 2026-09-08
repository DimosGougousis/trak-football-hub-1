import { IconRoleParent } from '@/components/icons/TrakIcons';

const ParentInfoPage = () => {
  return (
    <div className="app-container flex flex-col items-center justify-center px-6 py-12 min-h-screen">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <IconRoleParent size={32} />
      </div>
      <h1 className="text-2xl text-foreground mb-4 text-center">Parent Access</h1>
      <p className="text-muted-foreground text-center text-sm max-w-[300px] mb-6">
        Parents can only join Trak Football via an invite link from their child (the player).
      </p>
      <p className="text-muted-foreground text-center text-sm max-w-[300px] mb-8">
        Ask your child to send you an invite from their Trak account, then use the link to create your parent account.
      </p>
      <a href="/" className="text-primary text-sm font-medium hover:underline">
        ← Back to home
      </a>
    </div>
  );
};

export default ParentInfoPage;
