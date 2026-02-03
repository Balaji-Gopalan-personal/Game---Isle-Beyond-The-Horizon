export const convertImageToDataUri = (imagePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        const extension = imagePath.split('.').pop()?.toLowerCase();
        let mimeType = 'image/png';

        if (extension === 'jpg' || extension === 'jpeg') {
          mimeType = 'image/jpeg';
        } else if (extension === 'gif') {
          mimeType = 'image/gif';
        }

        const dataUri = canvas.toDataURL(mimeType, 0.95);
        resolve(dataUri);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imagePath}`));
    };

    img.src = imagePath;
  });
};

export const convertAssetMapToDataUris = async (
  assets: Record<string, string>
): Promise<Record<string, string>> => {
  const entries = Object.entries(assets);
  const results = await Promise.allSettled(
    entries.map(async ([key, path]) => {
      const dataUri = await convertImageToDataUri(path);
      return { key, dataUri };
    })
  );

  const converted: Record<string, string> = {};
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { key, dataUri } = result.value;
      converted[key] = dataUri;
    } else {
      failed.push(entries[index][0]);
      console.error(`Failed to convert ${entries[index][0]}:`, result.reason);
    }
  });

  if (failed.length > 0) {
    console.warn(`Failed to convert ${failed.length} asset(s): ${failed.join(', ')}`);
  }

  return converted;
};
