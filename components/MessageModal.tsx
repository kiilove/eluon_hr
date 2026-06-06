import React from 'react';
import { Check, X, AlertTriangle, Info, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type MessageType = 'info' | 'success' | 'warning' | 'error' | 'question';
export type MessageMode = 'alert' | 'confirm';

export interface MessageModalProps {
    isOpen: boolean;
    type: MessageType;
    mode: MessageMode;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}

const MessageModal: React.FC<MessageModalProps> = ({
    isOpen,
    type,
    mode,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel
}) => {
    const getIcon = () => {
        switch (type) {
            case 'success':
                return <Check className="w-8 h-8 text-emerald-600" />;
            case 'error':
                return <X className="w-8 h-8 text-red-600" />;
            case 'warning':
                return <AlertTriangle className="w-8 h-8 text-amber-600" />;
            case 'question':
                return <HelpCircle className="w-8 h-8 text-indigo-600" />;
            default:
                return <Info className="w-8 h-8 text-blue-600" />;
        }
    };

    const styles = {
        success: "bg-emerald-100/50 border-emerald-100 text-emerald-900",
        error: "bg-red-100/50 border-red-100 text-red-900",
        warning: "bg-amber-100/50 border-amber-100 text-amber-900",
        question: "bg-indigo-100/50 border-indigo-100 text-indigo-900",
        info: "bg-blue-100/50 border-blue-100 text-blue-900",
    };

    const buttonStyles = {
        success: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600",
        error: "bg-red-600 hover:bg-red-700 focus:ring-red-600",
        warning: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-600",
        question: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-600",
        info: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent
                className="sm:max-w-[400px] p-0 overflow-hidden border-0 shadow-2xl rounded-3xl"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <div className="p-6 flex flex-col items-center text-center pt-10">
                    <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ring-4 ring-white shadow-lg", styles[type])}>
                        {getIcon()}
                    </div>

                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-xl font-bold text-center text-slate-900">
                            {title || (type === 'error' ? '오류 발생' : type === 'success' ? '완료' : '알림')}
                        </DialogTitle>
                    </DialogHeader>

                    <DialogDescription className="text-center text-slate-600 text-base leading-relaxed whitespace-pre-wrap">
                        {message}
                    </DialogDescription>
                </div>

                <DialogFooter className="p-6 pt-2 bg-slate-50/50 flex gap-3 sm:gap-3 sm:justify-center flex-row">
                    {mode === 'confirm' && (
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-semibold"
                        >
                            {cancelText || '취소'}
                        </Button>
                    )}
                    <Button
                        onClick={onConfirm}
                        className={cn("flex-1 h-11 rounded-xl text-white font-bold shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5", buttonStyles[type])}
                    >
                        {confirmText || (mode === 'confirm' ? '확인' : '확인')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default MessageModal;
