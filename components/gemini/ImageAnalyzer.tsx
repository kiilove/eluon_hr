
import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, FileText } from "lucide-react";
import ReactMarkdown from 'react-markdown';

export const ImageAnalyzer = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [result, setResult] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            setResult(""); // Clear previous result
        }
    };

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    // Remove the Data URL prefix (e.g., "data:image/png;base64,")
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                } else {
                    reject(new Error("Failed to convert file to base64"));
                }
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleAnalyze = async () => {
        if (!selectedFile) return;

        setIsLoading(true);
        setResult("");

        try {
            const base64Image = await convertToBase64(selectedFile);

            const res = await fetch('/api/gemini/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: base64Image,
                    mimeType: selectedFile.type,
                    prompt: "Please analyze this document. Extract all key fields such as Title, Names, Dates, Work Times, and Content. Return the result in a structured Markdown format."
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || errData.details || "API Request Failed");
            }

            const data = await res.json();
            setResult(data.text);

        } catch (error: any) {
            console.error("Analysis Failed:", error);
            setResult(`**Error**: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-4xl mx-auto my-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="w-6 h-6" />
                    Gemini Document Analyzer (v2.5 Flash-Lite)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: Upload & Preview */}
                    <div className="space-y-4">
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors min-h-[300px]"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="max-w-full max-h-[400px] object-contain rounded" />
                            ) : (
                                <>
                                    <Upload className="w-12 h-12 text-gray-400 mb-2" />
                                    <p className="text-sm text-gray-500">Click to upload image</p>
                                </>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileSelect}
                            />
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleAnalyze}
                            disabled={!selectedFile || isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                "Analyze Document"
                            )}
                        </Button>
                    </div>

                    {/* Right Column: Results */}
                    <div className="bg-gray-50 rounded-lg p-4 min-h-[300px] max-h-[600px] overflow-y-auto border border-gray-200">
                        {result ? (
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown>{result}</ReactMarkdown>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                                Analysis results will appear here...
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
