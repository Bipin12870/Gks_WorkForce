import { ReactNode } from 'react';

interface AdminDataTableProps {
    children: ReactNode;
    emptyMessage?: string;
    isEmpty?: boolean;
}

export default function AdminDataTable({ children, emptyMessage, isEmpty }: AdminDataTableProps) {
    if (isEmpty && emptyMessage) {
        return (
            <div className="admin-table-empty">
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="admin-table-wrap">
            <table className="admin-table">{children}</table>
        </div>
    );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
    return (
        <thead className="admin-table-head">
            <tr>{children}</tr>
        </thead>
    );
}

export function AdminTableTh({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return (
        <th className={`admin-table-th ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
    );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
    return <tbody className="admin-table-body">{children}</tbody>;
}

export function AdminTableRow({ children }: { children: ReactNode }) {
    return <tr className="admin-table-row">{children}</tr>;
}

export function AdminTableTd({
    children,
    align = 'left',
}: {
    children: ReactNode;
    align?: 'left' | 'right';
}) {
    return <td className={`admin-table-td ${align === 'right' ? 'text-right' : ''}`}>{children}</td>;
}
