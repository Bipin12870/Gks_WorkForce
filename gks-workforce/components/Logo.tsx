import Image from 'next/image';

interface LogoProps {
    className?: string;
    size?: number;
    width?: number;
    height?: number;
}

export default function Logo({ className = '', size = 44, width, height }: LogoProps) {
    const finalWidth = width ?? size;
    const finalHeight = height ?? size;
    return (
        <div className={`flex items-center justify-center ${className}`}>
            <Image
                src="/logo.png"
                alt="GKS Logo"
                width={finalWidth}
                height={finalHeight}
                className="object-contain rounded-lg"
                priority
            />
        </div>
    );
}
