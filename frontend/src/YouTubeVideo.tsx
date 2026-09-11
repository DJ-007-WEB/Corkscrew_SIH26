interface YouTubeVideoProps {
  videoId: string;
  title: string;
}

export default function YouTubeVideo({ videoId, title }: YouTubeVideoProps) {
  return (
    <div className="rounded border border-[var(--bp-border)] bg-[var(--bp-ink)] overflow-hidden">
      <div className="aspect-video relative">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}
