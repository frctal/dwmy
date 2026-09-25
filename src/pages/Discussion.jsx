import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const IMAGE_BUCKET = "post-images";

function makeImageRecord(file) {
  return {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    name: file.name || "clipboard-image.png",
  };
}

function formatPostTime(timestamp) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return extensions[file.type] || "png";
}

function storagePath(userId, file) {
  return `${userId}/${crypto.randomUUID()}.${safeExtension(
    file
  )}`;
}

function imageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });

      URL.revokeObjectURL(url);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      resolve({
        width: null,
        height: null,
      });
    };

    image.src = url;
  });
}

export default function Discussion({
  discussion,
  goBack,
  user,
}) {
  const [posts, setPosts] = useState([]);
  const [reply, setReply] = useState("");
  const [images, setImages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [conversationTitle, setConversationTitle] =
    useState(discussion.title || "");

  const [conversationLocked, setConversationLocked] =
    useState(Boolean(discussion.locked));

  const [showModeration, setShowModeration] =
    useState(false);

  const [renamingConversation, setRenamingConversation] =
    useState(false);

  const [conversationTitleDraft, setConversationTitleDraft] =
    useState(discussion.title || "");

  const [moderating, setModerating] =
    useState(false);

  const previewRef = useRef([]);

  const isAdmin =
    user.roles?.includes("ADMIN") ||
    user.role === "admin";

  const isConversation =
    discussion.discussionType === "CONVERSATION";

  const isMarketSegment =
    discussion.discussionType === "MARKET_SEGMENT";

  useEffect(() => {
    previewRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      previewRef.current.forEach((image) =>
        URL.revokeObjectURL(image.url)
      );
    };
  }, []);

  async function hydrateAttachments(rows) {
    return Promise.all(
      (rows || []).map(async (post) => {
        const attachments = await Promise.all(
          (post.attachments || []).map(
            async (attachment) => {
              const { data, error } =
                await supabase.storage
                  .from(
                    attachment.storage_bucket ||
                      IMAGE_BUCKET
                  )
                  .createSignedUrl(
                    attachment.storage_path,
                    3600
                  );

              if (error) {
                console.error(
                  "Signed URL failed:",
                  error
                );

                return null;
              }

              return {
                ...attachment,
                url: data.signedUrl,
              };
            }
          )
        );

        return {
          ...post,
          attachments: attachments.filter(Boolean),
        };
      })
    );
  }

  async function loadPosts() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("posts")
      .select(`
        id,
        discussion_id,
        author_id,
        body,
        is_edited,
        is_deleted,
        created_at,
        updated_at,
        profiles!posts_author_id_fkey (
          id,
          username,
          display_name
        ),
        attachments (
          id,
          storage_bucket,
          storage_path,
          file_name,
          mime_type,
          file_size,
          width,
          height
        )
      `)
      .eq("discussion_id", discussion.id)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(error);
      setError(error.message);
      setPosts([]);
    } else {
      setPosts(
        await hydrateAttachments(data || [])
      );
    }

    setLoading(false);
  }

  async function loadConversationState() {
    if (!isConversation) return;

    const { data, error } = await supabase.rpc(
      "get_conversation_state",
      {
        target_discussion_id: discussion.id,
      }
    );

    if (error) {
      console.error(
        "Conversation state load failed:",
        error
      );
      return;
    }

    const state = data?.[0];

    if (!state) return;

    setConversationTitle(
      state.title || discussion.title || ""
    );

    setConversationTitleDraft(
      state.title || discussion.title || ""
    );

    setConversationLocked(
      Boolean(state.is_locked)
    );

    if (state.is_deleted) {
      goBack();
    }
  }

  useEffect(() => {
    loadPosts();
    loadConversationState();
  }, [discussion.id]);

  function addFiles(files) {
    const valid = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") &&
        file.size <= 10 * 1024 * 1024
    );

    setImages((current) => [
      ...current,
      ...valid.map(makeImageRecord),
    ]);
  }

  function handlePaste(event) {
    const files = Array.from(
      event.clipboardData?.items || []
    )
      .filter((item) =>
        item.type.startsWith("image/")
      )
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (files.length) addFiles(files);
  }

  function removePreview(id) {
    setImages((current) => {
      const target = current.find(
        (item) => item.id === id
      );

      if (target) {
        URL.revokeObjectURL(target.url);
      }

      return current.filter(
        (item) => item.id !== id
      );
    });
  }

  async function uploadAttachment(postId, record) {
    const file = record.file;
    const path = storagePath(user.id, file);

    const dimensions =
      await imageDimensions(file);

    const { error: uploadError } =
      await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

    if (uploadError) throw uploadError;

    const { error: metadataError } =
      await supabase
        .from("attachments")
        .insert({
          post_id: postId,
          uploaded_by: user.id,
          storage_bucket: IMAGE_BUCKET,
          storage_path: path,
          file_name:
            file.name ||
            "clipboard-image.png",
          mime_type: file.type,
          file_size: file.size,
          width: dimensions.width,
          height: dimensions.height,
        });

    if (metadataError) {
      await supabase.storage
        .from(IMAGE_BUCKET)
        .remove([path]);

      throw metadataError;
    }
  }

  async function submitReply(event) {
    event.preventDefault();

    if (isConversation && conversationLocked) {
      setError(
        "This conversation is locked."
      );
      return;
    }

    const body = reply.trim();

    if (!body && images.length === 0) return;

    setPosting(true);
    setError("");

    try {
      const { data: post, error } =
        await supabase
          .from("posts")
          .insert({
            discussion_id: discussion.id,
            author_id: user.id,
            body: body || null,
          })
          .select("id")
          .single();

      if (error) throw error;

      for (const image of images) {
        await uploadAttachment(post.id, image);
      }

      images.forEach((image) =>
        URL.revokeObjectURL(image.url)
      );

      setReply("");
      setImages([]);

      await loadPosts();
    } catch (err) {
      console.error(err);

      setError(
        err.message || "Unable to publish post."
      );
    } finally {
      setPosting(false);
    }
  }

  function beginEdit(post) {
    setEditingId(post.id);
    setEditBody(post.body || "");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
    setSavingEdit(false);
  }

  async function saveEdit(post) {
    const clean = editBody.trim();

    if (
      !clean &&
      (!post.attachments ||
        post.attachments.length === 0)
    ) {
      setError(
        "A post needs text or an attachment."
      );
      return;
    }

    setSavingEdit(true);
    setError("");

    const { error } = await supabase
      .from("posts")
      .update({
        body: clean || null,
      })
      .eq("id", post.id)
      .eq("author_id", user.id);

    if (error) {
      setError(error.message);
      setSavingEdit(false);
      return;
    }

    cancelEdit();
    await loadPosts();
  }

  async function removePost(post) {
    if (
      post.author_id !== user.id &&
      !isAdmin
    ) {
      return;
    }

    if (
      !window.confirm(
        "Remove this post from the discussion?"
      )
    ) {
      return;
    }

    setError("");

    const { error } = await supabase.rpc(
      "remove_post",
      {
        target_post_id: post.id,
      }
    );

    if (error) {
      setError(error.message);
      return;
    }

    await loadPosts();
  }

  async function saveConversationRename() {
    const clean =
      conversationTitleDraft.trim();

    if (!clean) return;

    setModerating(true);
    setError("");

    const { error } = await supabase.rpc(
      "rename_conversation",
      {
        target_discussion_id: discussion.id,
        new_title: clean,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    setConversationTitle(clean);
    setConversationTitleDraft(clean);
    setRenamingConversation(false);
    setModerating(false);
  }

  async function toggleConversationLocked() {
    setModerating(true);
    setError("");

    const nextLocked = !conversationLocked;

    const { error } = await supabase.rpc(
      "set_conversation_locked",
      {
        target_discussion_id: discussion.id,
        target_locked: nextLocked,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    setConversationLocked(nextLocked);
    setModerating(false);
    setShowModeration(false);
  }

  async function removeConversation() {
    const confirmed = window.confirm(
      `Remove "${conversationTitle}"?\n\n` +
        "The conversation will disappear from the forum, " +
        "but its history will be preserved."
    );

    if (!confirmed) return;

    setModerating(true);
    setError("");

    const { error } = await supabase.rpc(
      "remove_conversation",
      {
        target_discussion_id: discussion.id,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    goBack();
  }

  function authorName(post) {
    return (
      post.profiles?.display_name ||
      post.profiles?.username ||
      "DWMY User"
    );
  }

  return (
    <div className="discussion-page">
      <button
        className="back-link"
        onClick={goBack}
      >
        &lt;- Back to forum
      </button>

      {isConversation && (
        <>
          <div className="breadcrumb">
            <span>Conversations</span>
            <span>&gt;</span>
            <span>{conversationTitle}</span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                DWMY CONVERSATION
              </span>

              <h1>{conversationTitle}</h1>

              <p>
                Free-form community discussion.
              </p>
            </div>

            {isAdmin && (
              <div className="thread-moderation">
                <button
                  type="button"
                  className="dwmy-action-button"
                  onClick={() =>
                    setShowModeration(
                      (current) => !current
                    )
                  }
                >
                  Moderate
                </button>

                {showModeration && (
                  <div className="moderation-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingConversation(true);
                        setShowModeration(false);
                      }}
                    >
                      Rename Conversation
                    </button>

                    <button
                      type="button"
                      onClick={
                        toggleConversationLocked
                      }
                      disabled={moderating}
                    >
                      {conversationLocked
                        ? "Unlock Conversation"
                        : "Lock Conversation"}
                    </button>

                    <button
                      type="button"
                      className="danger-action"
                      onClick={removeConversation}
                      disabled={moderating}
                    >
                      Remove Conversation
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {conversationLocked && (
            <div className="thread-state-banner">
              This conversation is locked.
            </div>
          )}

          {renamingConversation && (
            <div className="thread-rename-panel">
              <span className="eyebrow">
                Rename Conversation
              </span>

              <input
                value={conversationTitleDraft}
                onChange={(event) =>
                  setConversationTitleDraft(
                    event.target.value
                  )
                }
                maxLength={160}
                autoFocus
              />

              <div className="native-action-row">
                <button
                  type="button"
                  className="dwmy-text-button"
                  onClick={() => {
                    setRenamingConversation(false);
                    setConversationTitleDraft(
                      conversationTitle
                    );
                  }}
                  disabled={moderating}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={saveConversationRename}
                  disabled={
                    moderating ||
                    !conversationTitleDraft.trim()
                  }
                >
                  {moderating
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {isMarketSegment && (
        <>
          <div className="breadcrumb">
            <span>{discussion.section}</span>
            <span>&gt;</span>
            <span>{discussion.instrument}</span>
            <span>&gt;</span>
            <span>{discussion.segmentType}</span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                {discussion.segmentType} /{" "}
                {discussion.segmentStart}
              </span>

              <h1>{discussion.title}</h1>

              <p>
                Canonical discussion for{" "}
                {discussion.instrument} /{" "}
                {discussion.segmentType?.toLowerCase()}{" "}
                segment
              </p>
            </div>
          </section>

          <div className="segment-tabs">
            {["DAY", "WEEK", "MONTH", "YEAR"].map(
              (segment) => (
                <button
                  key={segment}
                  className={
                    discussion.segmentType === segment
                      ? "active"
                      : ""
                  }
                >
                  {segment[0] +
                    segment.slice(1).toLowerCase()}
                </button>
              )
            )}
          </div>

          <div className="date-navigator">
            <button>&lt;- Previous</button>

            <strong>
              {discussion.segmentStart}
            </strong>

            <button>Next -&gt;</button>
          </div>
        </>
      )}

      {!isConversation && !isMarketSegment && (
        <>
          <div className="breadcrumb">
            <span>DWMY</span>
            <span>&gt;</span>
            <span>
              {discussion.title || "Discussion"}
            </span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                DWMY DISCUSSION
              </span>

              <h1>
                {discussion.title || "Discussion"}
              </h1>
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="discussion-open-error">
          {error}
        </div>
      )}

      <div className="post-list">
        {loading && (
          <div className="market-directory-state">
            Loading discussion...
          </div>
        )}

        {!loading &&
          posts.length === 0 && (
            <div className="market-directory-state">
              No posts yet. Start the discussion.
            </div>
          )}

        {!loading &&
          posts.map((post) => {
            const name = authorName(post);

            const owns =
              post.author_id === user.id;

            return (
              <article
                className="post-card"
                key={post.id}
              >
                <aside className="post-author">
                  <div className="post-avatar">
                    {name[0]?.toUpperCase() || "D"}
                  </div>

                  <strong>{name}</strong>

                  <span>
                    {owns
                      ? user.role?.toUpperCase()
                      : "MEMBER"}
                  </span>
                </aside>

                <div className="post-body">
                  <div className="post-toolbar">
                    <span>
                      {formatPostTime(
                        post.created_at
                      )}

                      {post.is_edited &&
                        !post.is_deleted &&
                        " (edited)"}
                    </span>

                    {!post.is_deleted && (
                      <div className="post-actions">
                        {owns && (
                          <button
                            type="button"
                            className="dwmy-text-button"
                            onClick={() =>
                              beginEdit(post)
                            }
                          >
                            Edit
                          </button>
                        )}

                        {owns && (
                          <button
                            type="button"
                            className="dwmy-text-button"
                            onClick={() =>
                              removePost(post)
                            }
                          >
                            Remove
                          </button>
                        )}


                      </div>
                    )}
                  </div>

                  {post.is_deleted ? (
                    <p>
                      <em>
                        This post was removed.
                      </em>
                    </p>
                  ) : editingId === post.id ? (
                    <div className="post-edit-native">
                      <textarea
                        value={editBody}
                        onChange={(event) =>
                          setEditBody(
                            event.target.value
                          )
                        }
                        autoFocus
                      />

                      <div className="native-action-row">
                        <button
                          type="button"
                          className="dwmy-text-button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            saveEdit(post)
                          }
                          disabled={savingEdit}
                        >
                          {savingEdit
                            ? "Saving..."
                            : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.body && (
                        <p>{post.body}</p>
                      )}

                      {post.attachments?.length >
                        0 && (
                        <div className="post-images">
                          {post.attachments.map(
                            (attachment) => (
                              <img
                                key={attachment.id}
                                src={attachment.url}
                                alt={
                                  attachment.file_name ||
                                  "DWMY attachment"
                                }
                                loading="lazy"
                              />
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
      </div>

      {isConversation && conversationLocked ? (
        <div className="reply-box locked-reply-box">
          <div className="reply-heading">
            <strong>
              Conversation locked
            </strong>

            <span>
              New replies are currently closed.
            </span>
          </div>
        </div>
      ) : (
        <form
          className={`reply-box ${
            dragging ? "dragging" : ""
          }`}
          onSubmit={submitReply}
          onPaste={handlePaste}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() =>
            setDragging(false)
          }
        >
          <div className="reply-heading">
            <strong>Reply to discussion</strong>

            <span>
              Paste screenshots with Ctrl+V or drag
              them here
            </span>
          </div>

          <textarea
            value={reply}
            onChange={(event) =>
              setReply(event.target.value)
            }
            placeholder="Write your reply or paste a screenshot..."
            disabled={posting}
          />

          {images.length > 0 && (
            <div className="image-preview-grid">
              {images.map((image) => (
                <div
                  className="image-preview"
                  key={image.id}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      removePreview(image.id)
                    }
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          {dragging && (
            <div className="drop-overlay">
              Drop screenshot here
            </div>
          )}

          <div className="reply-footer">
            <label className="attachment-button">
              + Add image

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={posting}
            >
              {posting
                ? "Publishing..."
                : "Post Reply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}