import React, { createContext, useContext, useState, useCallback } from 'react';
import MessageModal, { MessageType, MessageMode } from '@/components/MessageModal';

interface MessageOptions {
    type?: MessageType;
    title?: string;
    confirmText?: string;
    cancelText?: string;
}

interface MessageModalContextType {
    showAlert: (message: string, options?: MessageOptions) => Promise<void>;
    showConfirm: (message: string, options?: MessageOptions) => Promise<boolean>;
}

const MessageModalContext = createContext<MessageModalContextType | undefined>(undefined);

export const MessageModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState<{
        type: MessageType;
        mode: MessageMode;
        title?: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        resolve: ((value: boolean) => void) | null;
    }>({
        type: 'info',
        mode: 'alert',
        message: '',
        resolve: null
    });

    const showAlert = useCallback((message: string, options?: MessageOptions): Promise<void> => {
        return new Promise((resolve) => {
            setConfig({
                type: options?.type || 'info',
                mode: 'alert',
                title: options?.title,
                message,
                confirmText: options?.confirmText,
                resolve: () => {
                    resolve();
                    return true;
                }
            });
            setIsOpen(true);
        });
    }, []);

    const showConfirm = useCallback((message: string, options?: MessageOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfig({
                type: options?.type || 'question',
                mode: 'confirm',
                title: options?.title,
                message,
                confirmText: options?.confirmText,
                cancelText: options?.cancelText,
                resolve
            });
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = () => {
        if (config.resolve) {
            config.resolve(true);
        }
        setIsOpen(false);
    };

    const handleCancel = () => {
        if (config.resolve) {
            config.resolve(false);
        }
        setIsOpen(false);
    };

    return (
        <MessageModalContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            <MessageModal
                isOpen={isOpen}
                type={config.type}
                mode={config.mode}
                title={config.title}
                message={config.message}
                confirmText={config.confirmText}
                cancelText={config.cancelText}
                onConfirm={handleConfirm}
                onCancel={config.mode === 'confirm' ? handleCancel : undefined}
            />
        </MessageModalContext.Provider>
    );
};

export const useMessageModal = (): MessageModalContextType => {
    const context = useContext(MessageModalContext);
    if (!context) {
        throw new Error('useMessageModal must be used within MessageModalProvider');
    }
    return context;
};
