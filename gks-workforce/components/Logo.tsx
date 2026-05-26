import Image from 'next/image';

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
}

export default function Logo({ className = '', width = 200, height = 60 }: LogoProps) {
    return (
        <div className={`flex items-center justify-center ${className}`}>
            <Image
                src="/logo.jpg"
                alt="GKS Logo"
                width={width}
                height={height}
                className="object-contain"
                priority
            />
        </div>
    );
}
