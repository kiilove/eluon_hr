
export const handleSaveToDB = async ({
    data,
    showAlert,
    showConfirm,
    setIsProcessing,
    setLoadingMessage
}: {
    data: any,
    showAlert: (msg: string, options?: any) => void,
    showConfirm: (msg: string, options?: any) => Promise<boolean>,
    setIsProcessing: (val: boolean) => void,
    setLoadingMessage: (val: string) => void
}) => {
    const sourceData = data?.v4 || data?.v3 || data?.v2;
    if (!sourceData || sourceData.length === 0) return;

    const userStr = localStorage.getItem('user');
    const userObj = userStr ? JSON.parse(userStr) : null;
    const companyId = userObj?.company_id;

    if (!companyId) {
        await showAlert("로그인 정보(회사 ID)를 찾을 수 없습니다. 다시 로그인해주세요.", { type: 'error' });
        return;
    }

    const confirmed = await showConfirm(`데이터를 시스템(DB)에 저장하시겠습니까?\n총 ${sourceData.length}건 저장\n대상 회사: ${companyId}`, { title: 'DB 저장', type: 'warning', confirmText: '저장' });
    if (!confirmed) return;

    setIsProcessing(true);
    setLoadingMessage(`데이터 저장 준비 중... (총 ${sourceData.length}건)`);
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        const CHUNK_SIZE = 50;
        let savedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < sourceData.length; i += CHUNK_SIZE) {
            const chunk = sourceData.slice(i, i + CHUNK_SIZE);
            const currentProgress = Math.min(i + CHUNK_SIZE, sourceData.length);

            setLoadingMessage(`데이터 저장 중: ${currentProgress} / ${sourceData.length} 건 처리 중...`);

            const response = await fetch('/api/processing/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logs: chunk,
                    companyId: companyId
                })
            });

            const result: any = await response.json();

            if (response.ok && result.success) {
                savedCount += (result.saved || 0);
                skippedCount += (result.skipped || 0);
            } else {
                throw new Error(result.message || "서버 통신 오류");
            }
        }

        setIsProcessing(false);
        let msg = `성공적으로 저장되었습니다.\n- 저장됨: ${savedCount}건`;
        if (skippedCount > 0) {
            msg += `\n- 제외됨: ${skippedCount}건 (명부에 없는 직원)`;
        }
        await showAlert(msg, { type: 'success' });

    } catch (error: any) {
        setIsProcessing(false);
        console.error("Save failed", error);
        await showAlert(`저장 중 오류가 발생했습니다: ${error.message}`, { type: 'error' });
    }
};
