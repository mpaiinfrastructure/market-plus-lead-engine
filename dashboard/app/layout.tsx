import './globals.css';

export const metadata = {
  title: 'Market Plus // Command Center',
  description: 'Autonomous lead engine operations dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
